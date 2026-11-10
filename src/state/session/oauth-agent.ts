import {type Agent} from '@atproto/lex'
import {type OAuthSession} from '@atproto/oauth-client'

import {BSKY_SERVICE} from '#/lib/constants'
import {logger} from '#/logger'
import {reportProxiedFetch} from '#/state/appview-health'
import {com} from '#/lexicons'
import {
  buildAppviewClient,
  buildChatClient,
  buildPdsClient,
} from './clients'
import {configureModerationForAccount} from './moderation'
import {getOAuthClient, TERMINAL_OAUTH_ERRORS} from './oauth-client'
import {
  categorizeOauthError,
  emitOauthTelemetry,
  truncateOauthMessage,
} from './oauth-telemetry'
import {OAuthCore, type OAuthSessionBundle} from './session-core'
import {type SessionAccount} from './types'

type OAuthSessionHandle = Pick<OAuthSession, 'did' | 'fetchHandler'>

type OAuthBundleResult = {account: SessionAccount; bundle: OAuthSessionBundle}

/*
 * app.bsky.actor.getPreferences / putPreferences and the space record methods
 * are served by the account's own PDS. An appview proxy header must not reach
 * them on a PDS whose home appview differs from ours: that PDS honors the
 * header and forwards the call to our appview, which answers 501.
 */
const PDS_LOCAL_PROXY_EXEMPT_METHODS = [
  'app.bsky.actor.getPreferences',
  'app.bsky.actor.putPreferences',
  'com.atproto.space.createRecord',
  'com.atproto.space.deleteRecord',
  'com.atproto.space.getRecord',
]

export function stripAppviewProxyForPdsLocalMethods(
  input: string | URL | Request,
  init: RequestInit | undefined,
): RequestInit | undefined {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (
    !url ||
    !PDS_LOCAL_PROXY_EXEMPT_METHODS.some(method => url.includes(method))
  ) {
    return init
  }
  const headers = new Headers(init?.headers)
  headers.delete('atproto-proxy')
  return {...init, headers}
}

/**
 * The lex agent every OAuth client is built over. It feeds each response into
 * the appview health tracker, which is what detects a home appview outage.
 */
export function buildOAuthAgent(session: OAuthSessionHandle): Agent {
  return {
    get did() {
      return session.did
    },
    fetchHandler(path, init) {
      const finalInit = stripAppviewProxyForPdsLocalMethods(path, init) ?? init
      return session.fetchHandler(path, finalInit).then(
        res => {
          reportProxiedFetch(finalInit, res.status)
          return res
        },
        (err: unknown) => {
          reportProxiedFetch(finalInit, null)
          throw err
        },
      )
    },
  }
}

function buildOAuthBundle(
  session: OAuthSessionHandle,
  issuer: string,
): OAuthSessionBundle {
  const agent = buildOAuthAgent(session)
  return {
    session: new OAuthCore(session.did, issuer),
    appviewClient: buildAppviewClient(agent),
    pdsClient: buildPdsClient(agent),
    chatClient: buildChatClient(agent),
    service: new URL(issuer),
  }
}

export async function createOAuthSessionBundle(
  session: OAuthSession,
): Promise<OAuthBundleResult> {
  const bundle = buildOAuthBundle(session, session.serverMetadata.issuer)
  const account = await oauthSessionToSessionAccountOrThrow(bundle, session)
  configureModerationForAccount(bundle, account)
  return {account, bundle}
}

const OAUTH_RESTORE_TIMEOUT_MS = 10_000

type OAuthRestoreClient = {
  restore(did: string): Promise<OAuthSession>
}

function restoreOAuthSession(did: string) {
  const client: OAuthRestoreClient = getOAuthClient()
  return client.restore(did)
}

export async function resumeOAuthSessionBundle(
  account: SessionAccount,
): Promise<OAuthBundleResult> {
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
  return await createOAuthSessionBundle(session)
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

export async function resumeOAuthSessionBundleWithRetry(
  account: SessionAccount,
  keepOnTransientFailure = false,
): Promise<OAuthBundleResult> {
  let error: unknown
  let errorCategory: ReturnType<typeof categorizeOauthError> = 'unknown'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await resumeOAuthSessionBundle(account)
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
  const bundle = buildOAuthBundle(session, account.service)
  configureModerationForAccount(bundle, account)
  return {account, bundle}
}

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

async function oauthSessionToSessionAccountOrThrow(
  bundle: OAuthSessionBundle,
  session: OAuthSession,
): Promise<SessionAccount> {
  let data: com.atproto.server.getSession.$OutputBody
  try {
    data = await withTimeout(
      bundle.pdsClient.call(com.atproto.server.getSession, {}),
      OAUTH_RESTORE_TIMEOUT_MS,
      'getSession timed out',
    )
  } catch (e) {
    logger.error('oauthSessionToSessionAccount: getSession failed', {
      error: e instanceof Error ? e.message : String(e),
    })
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
  } catch (e) {
    logger.error('oauthSessionToSessionAccount: getTokenInfo failed', {
      error: e instanceof Error ? e.message : String(e),
    })
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
