/* eslint-disable @typescript-eslint/no-explicit-any -- Expo OAuth types do not resolve in Linux CI */
import {
  Agent,
  type AtpSessionData,
  type ComAtprotoServerGetSession,
} from '@atproto/api'
import {type OAuthSession} from '@atproto/oauth-client'

import {BLUESKY_PROXY_HEADER, BSKY_SERVICE} from '#/lib/constants'
import {logger} from '#/logger'
import {reportProxiedFetch} from '#/state/appview-health'
import {
  sessionAccountToSession,
  stripAppviewProxyForPdsLocalMethods,
} from './agent'
import {configureModerationForAccount} from './moderation'
import {getOAuthClient, TERMINAL_OAUTH_ERRORS} from './oauth-client'
import {restoreOAuthSession} from './oauth-restore'
import {
  categorizeOauthError,
  emitOauthTelemetry,
  truncateOauthMessage,
} from './oauth-telemetry'
import {type SessionAccount} from './types'

export async function oauthCreateAgent(session: OAuthSession) {
  const agent = new OauthBskyAppAgent(session)
  const account = await oauthAgentAndSessionToSessionAccountOrThrow(
    agent,
    session,
  )
  const gates = Promise.resolve()
  const moderation = configureModerationForAccount(agent, account)
  return agent.prepare(account, gates, moderation)
}

const OAUTH_RESTORE_TIMEOUT_MS = 10_000

export async function oauthResumeSession(account: SessionAccount) {
  const client = getOAuthClient()
  let session: OAuthSession
  try {
    session = await restoreOAuthSession(
      client,
      account.did,
      OAUTH_RESTORE_TIMEOUT_MS,
    )
  } catch (e) {
    logger.error('oauthResumeSession: restore failed', {
      did: account.did,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
  return await oauthCreateAgent(session)
}

const OAUTH_RESUME_RETRY_DELAY_MS = 500

const TRANSIENT_RESUME_ERRORS = new Set([
  'network',
  'timeout',
  'serverError',
  'dpopSkew',
  'dpopOther',
])

function isTerminalOAuthError(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== 'object' || depth > 5) return false
  if (TERMINAL_OAUTH_ERRORS.some(ErrorClass => e instanceof ErrorClass)) {
    return true
  }
  if ('errors' in e && Array.isArray(e.errors)) {
    return e.errors.some(err => isTerminalOAuthError(err, depth + 1))
  }
  return 'cause' in e && isTerminalOAuthError(e.cause, depth + 1)
}

export async function oauthResumeSessionWithRetry(account: SessionAccount) {
  let error: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await oauthResumeSession(account)
    } catch (e) {
      error = e
    }
    if (isTerminalOAuthError(error)) throw error
    // A timeout has already held the splash screen for the full budget.
    if (categorizeOauthError(error) === 'timeout') break
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, OAUTH_RESUME_RETRY_DELAY_MS))
    }
  }
  const errorCategory = categorizeOauthError(error)
  if (!TRANSIENT_RESUME_ERRORS.has(errorCategory)) throw error

  // Throws if the OAuth client deleted the session.
  const session = await restoreOAuthSession(
    getOAuthClient(),
    account.did,
    OAUTH_RESTORE_TIMEOUT_MS,
    false,
  )
  logger.warn('oauthResumeSession: keeping stored account after failure', {
    did: account.did,
    errorCategory,
  })
  emitOauthTelemetry({
    type: 'oauth:sessionResumeDegraded',
    payload: {errorCategory, message: truncateOauthMessage(error)},
  })
  const agent = new OauthBskyAppAgent(session)
  const moderation = configureModerationForAccount(agent, account)
  return agent.prepare(account, Promise.resolve(), moderation)
}

export async function oauthAgentAndSessionToSessionAccountOrThrow(
  agent: Agent,
  session: OAuthSession,
): Promise<SessionAccount> {
  let data: ComAtprotoServerGetSession.OutputSchema
  try {
    const res = await Promise.race([
      agent.com.atproto.server.getSession(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('getSession timed out')),
          OAUTH_RESTORE_TIMEOUT_MS,
        ),
      ),
    ])
    data = res.data
  } catch (e: any) {
    logger.error('oauthAgentAndSessionToSessionAccount: getSession failed', e)
    throw e
  }
  let aud: string
  try {
    const tokenInfo = await Promise.race([
      session.getTokenInfo(false),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('getTokenInfo timed out')),
          OAUTH_RESTORE_TIMEOUT_MS,
        ),
      ),
    ])
    aud = tokenInfo.aud
  } catch (e: any) {
    logger.error('oauthAgentAndSessionToSessionAccount: getTokenInfo failed', e)
    throw e
  }
  return {
    service: session.serverMetadata.issuer,
    did: session.did,
    handle: data.handle,
    email: data.email,
    emailConfirmed: data.emailConfirmed,
    emailAuthFactor: data.emailAuthFactor,
    active: data.active,
    status: data.status,
    pdsUrl: aud,
    isSelfHosted: !session.server.issuer.startsWith(BSKY_SERVICE),
    isOauthSession: true,
  }
}

export class OauthBskyAppAgent extends Agent {
  session?: AtpSessionData
  dispatchUrl?: string

  constructor(session: OAuthSession) {
    // Wrap the OAuth session's fetchHandler so the appview proxy header is
    // stripped from PDS-local methods. The header is added by the Agent's XRPC
    // wrapper before it calls the session manager, so stripping here removes it
    // from the outbound request. See stripAppviewProxyForPdsLocalMethods.
    super({
      get did() {
        return session.did
      },
      fetchHandler(url, init) {
        const finalInit = stripAppviewProxyForPdsLocalMethods(url, init) ?? init
        return session.fetchHandler(url, finalInit).then(
          res => {
            reportProxiedFetch(finalInit, res.status)
            return res
          },
          err => {
            reportProxiedFetch(finalInit, null)
            throw err
          },
        )
      },
    })
  }

  async prepare(
    account: SessionAccount,
    gates: Promise<void>,
    moderation: Promise<void>,
  ) {
    this.session = sessionAccountToSession(account)
    this.dispatchUrl = account.pdsUrl
    this.configureProxy(BLUESKY_PROXY_HEADER.get())

    await Promise.all([gates, moderation])

    return {account, agent: this}
  }

  dispose() {}
}
