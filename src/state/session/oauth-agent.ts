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

type OAuthRestoreClient = {
  restore(did: string): Promise<OAuthSession>
}

function restoreOAuthSession(did: string) {
  const client: OAuthRestoreClient = getOAuthClient()
  return client.restore(did)
}

export async function oauthResumeSession(account: SessionAccount) {
  let session: OAuthSession
  try {
    session = await withTimeout(
      restoreOAuthSession(account.did),
      OAUTH_RESTORE_TIMEOUT_MS,
      'OAuth session restore timed out',
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
  'dpopNonce',
  'dpopStale',
  'dpopReplayed',
])

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

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

export async function oauthResumeSessionWithRetry(
  account: SessionAccount,
  keepOnTransientFailure = false,
) {
  let error: unknown
  let errorCategory: ReturnType<typeof categorizeOauthError> = 'unknown'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await oauthResumeSession(account)
    } catch (e) {
      error = e
    }
    errorCategory = categorizeOauthError(error)
    if (isTerminalOAuthError(error)) throw error
    if (!TRANSIENT_RESUME_ERRORS.has(errorCategory)) throw error
    // A timeout has already held the splash screen for the full budget.
    if (errorCategory === 'timeout') break
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, OAUTH_RESUME_RETRY_DELAY_MS))
    }
  }
  if (!keepOnTransientFailure) throw error

  // Restoring now could wait on the same stuck refresh, so defer it to the
  // first request.
  const session = lazyOAuthSession(account.did)
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

type OAuthSessionHandle = Pick<OAuthSession, 'did' | 'fetchHandler'>

function lazyOAuthSession(did: string): OAuthSessionHandle {
  let pending: Promise<OAuthSession> | undefined
  return {
    did: did as OAuthSession['did'],
    fetchHandler(url, init) {
      const restoring = (pending ??= restoreOAuthSession(did).catch(
        (e: unknown) => {
          pending = undefined
          throw e
        },
      ))
      return restoring.then(session => session.fetchHandler(url, init))
    },
  }
}

export async function oauthAgentAndSessionToSessionAccountOrThrow(
  agent: Agent,
  session: OAuthSession,
): Promise<SessionAccount> {
  let data: ComAtprotoServerGetSession.OutputSchema
  try {
    const res = await withTimeout(
      agent.com.atproto.server.getSession(),
      OAUTH_RESTORE_TIMEOUT_MS,
      'getSession timed out',
    )
    data = res.data
  } catch (e: any) {
    logger.error('oauthAgentAndSessionToSessionAccount: getSession failed', e)
    throw e
  }
  let aud: string
  try {
    const tokenInfo = await withTimeout(
      session.getTokenInfo(false),
      OAUTH_RESTORE_TIMEOUT_MS,
      'getTokenInfo timed out',
    )
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

  constructor(session: OAuthSessionHandle) {
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
