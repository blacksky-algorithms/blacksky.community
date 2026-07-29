import {
  Agent as BaseAgent,
  type AppBskyActorProfile,
  type AtprotoServiceType,
  type AtpSessionData,
  type AtpSessionEvent,
  BskyAgent,
  type Did,
  type Un$Typed,
} from '@atproto/api'
import {TID} from '@atproto/common-web'
import {
  type FetchHandler,
  type FetchHandlerObject,
  type FetchHandlerOptions,
} from '@atproto/xrpc'

// @atproto/api 0.20.x stopped exporting SessionManager from a top-level path,
// but its only contract is FetchHandlerObject — use that here.
type SessionManager = FetchHandlerObject

import {networkRetry} from '#/lib/async/retry'
import {timeout} from '#/lib/async/timeout'
import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {
  BLUESKY_PROXY_HEADER,
  BSKY_SERVICE,
  IS_PROD_SERVICE,
  PUBLIC_BSKY_SERVICE,
} from '#/lib/constants'
import {getAge} from '#/lib/strings/time'
import {logger} from '#/logger'
import {snoozeEmailConfirmationPrompt} from '#/state/shell/reminders'
import {features} from '#/analytics'
import {emitNetworkConfirmed, emitNetworkLost} from '../events'
import {addSessionErrorLog} from './logging'
import {
  configureModerationForAccount,
  configureModerationForGuest,
} from './moderation'
import {type SessionAccount} from './types'
import {isSessionExpired, isSignupQueued} from './util'

export type ProxyHeaderValue = `${Did}#${AtprotoServiceType}`

export function createPublicAgent() {
  configureModerationForGuest() // Side effect but only relevant for tests

  const agent = new BskyAppAgent({service: PUBLIC_BSKY_SERVICE})
  agent.configureProxy(BLUESKY_PROXY_HEADER.get())
  return agent
}

export async function createAgentAndResume(
  storedAccount: SessionAccount,
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service: storedAccount.service})
  if (storedAccount.pdsUrl) {
    agent.sessionManager.pdsUrl = new URL(storedAccount.pdsUrl)
  }
  const gates = features.refresh({
    strategy: 'prefer-low-latency',
  })
  const moderation = configureModerationForAccount(agent, storedAccount)
  const prevSession: AtpSessionData = sessionAccountToSession(storedAccount)
  if (isSessionExpired(storedAccount)) {
    await networkRetry(1, () => agent.resumeSession(prevSession))
  } else {
    agent.sessionManager.session = prevSession
  }

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  return agent.prepare({
    resolvers: [gates, moderation],
    onSessionChange,
  })
}

export async function createAgentAndLogin(
  {
    service,
    identifier,
    password,
    authFactorToken,
  }: {
    service: string
    identifier: string
    password: string
    authFactorToken?: string
  },
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service})
  await agent.login({
    identifier,
    password,
    authFactorToken,
    allowTakendown: true,
  })

  const account = agentToSessionAccountOrThrow(agent)
  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  const moderation = configureModerationForAccount(agent, account)

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  return agent.prepare({
    resolvers: [gates, moderation],
    onSessionChange,
  })
}

// Delays (ms) before each poll attempt. ~23s total across 6 attempts before we
// decide the appview never indexed the account and trigger the self-heal.
const REINDEX_POLL_DELAYS_MS = [0, 1000, 2000, 4000, 8000, 8000]
// Shorter poll after the repair, just to confirm and log the outcome.
const REINDEX_CONFIRM_DELAYS_MS = [1000, 2000, 4000]

async function isProfileIndexed(agent: BskyAgent, did: string) {
  try {
    await agent.getProfile({actor: did})
    return true
  } catch {
    // Any failure — actor-not-found or a transient network error — is treated
    // as "not indexed". Over-triggering is harmless: the repair is a no-op.
    return false
  }
}

async function pollForIndexing(
  agent: BskyAgent,
  did: string,
  delaysMs: number[],
) {
  for (const delay of delaysMs) {
    if (delay > 0) {
      await timeout(delay)
    }
    if (await isProfileIndexed(agent, did)) {
      return true
    }
  }
  return false
}

/**
 * On account creation the appview sometimes misses the new-account event and
 * never indexes the account, so the profile never resolves. Calling
 * `updateHandle` with the user's *current* handle is a no-op at the PDS but
 * re-emits a `#identity` event on the firehose, which the appview indexer then
 * catches and back-fills the account.
 *
 * This best-effort self-heal polls for the profile and, only if it never shows
 * up, fires that no-op. It reads the handle fresh from the live session at
 * repair time (never a captured value) so it re-emits whatever the current
 * handle is rather than reverting a handle the user changed in the meantime.
 *
 * Fire-and-forget: it never throws and never blocks onboarding.
 */
export async function verifyAndRepairAccountIndexing(
  agent: BskyAgent,
  did: string,
  {
    pollDelaysMs = REINDEX_POLL_DELAYS_MS,
    confirmDelaysMs = REINDEX_CONFIRM_DELAYS_MS,
  }: {pollDelaysMs?: number[]; confirmDelaysMs?: number[]} = {},
): Promise<void> {
  try {
    if (await pollForIndexing(agent, did, pollDelaysMs)) {
      return
    }

    // Read the handle fresh at repair time to avoid clobbering a change made
    // during the poll window.
    const handle = agent.session?.handle
    if (!handle) {
      logger.warn(
        `verifyAndRepairAccountIndexing: no active session handle, skipping repair`,
      )
      return
    }

    logger.warn(
      `verifyAndRepairAccountIndexing: profile not indexed, re-emitting identity via updateHandle`,
    )
    try {
      await agent.updateHandle({handle})
    } catch (e) {
      logger.error(e instanceof Error ? e : String(e), {
        message: `verifyAndRepairAccountIndexing: updateHandle re-emit failed`,
      })
      return
    }

    const recovered = await pollForIndexing(agent, did, confirmDelaysMs)
    if (recovered) {
      logger.info(`verifyAndRepairAccountIndexing: appview indexing recovered`)
    } else {
      logger.error(
        `verifyAndRepairAccountIndexing: profile still not indexed after re-emit`,
      )
    }
  } catch (e) {
    // Best-effort: never let a self-heal failure surface to signup/onboarding.
    logger.error(e instanceof Error ? e : String(e), {
      message: `verifyAndRepairAccountIndexing: unexpected error`,
    })
  }
}

export async function createAgentAndCreateAccount(
  {
    service,
    email,
    password,
    handle,
    birthDate,
    inviteCode,
    verificationPhone,
    verificationCode,
  }: {
    service: string
    email: string
    password: string
    handle: string
    birthDate: Date
    inviteCode?: string
    verificationPhone?: string
    verificationCode?: string
  },
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service})
  await agent.createAccount({
    email,
    password,
    handle,
    inviteCode,
    verificationPhone,
    verificationCode,
  })
  const account = agentToSessionAccountOrThrow(agent)
  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  const moderation = configureModerationForAccount(agent, account)

  const createdAt = new Date().toISOString()
  const birthdate = birthDate.toISOString()

  // Not awaited so that we can still get into onboarding.
  // This is OK because we won't let you toggle adult stuff until you set the date.
  if (IS_PROD_SERVICE(service)) {
    void Promise.allSettled([
      networkRetry(3, () => {
        return agent.setPersonalDetails({
          birthDate: birthdate,
        })
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set birthDate`)
        throw e
      }),
      networkRetry(3, () => {
        return agent.upsertProfile(prev => {
          const next: Un$Typed<AppBskyActorProfile.Record> = prev || {}
          next.displayName = handle
          next.createdAt = createdAt
          return next
        })
      }).catch(e => {
        logger.info(
          `createAgentAndCreateAccount: failed to set initial profile`,
        )
        throw e
      }),
      networkRetry(1, () => {
        const pinnedFeeds = DEFAULT_BRAND_CONFIG.feeds.defaultPinned.map(f => ({
          ...f,
          id: TID.nextStr(),
        }))
        return agent.overwriteSavedFeeds(pinnedFeeds)
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set initial feeds`)
        throw e
      }),
      ...(getAge(birthDate) < 18
        ? [
            networkRetry(3, () => {
              return agent.com.atproto.repo.putRecord({
                repo: account.did,
                collection: 'chat.bsky.actor.declaration',
                rkey: 'self',
                record: {
                  $type: 'chat.bsky.actor.declaration',
                  allowIncoming: 'none',
                },
              })
            }).catch(e => {
              logger.info(
                `createAgentAndCreateAccount: failed to set chat declaration`,
              )
              throw e
            }),
          ]
        : []),
    ]).then(promises => {
      const rejected = promises.filter(p => p.status === 'rejected')
      if (rejected.length > 0) {
        logger.error(
          `session: createAgentAndCreateAccount failed to save personal details and feeds`,
        )
      }
    })
  } else {
    void Promise.allSettled([
      networkRetry(3, () => {
        return agent.setPersonalDetails({
          birthDate: birthDate.toISOString(),
        })
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set birthDate`)
        throw e
      }),
      networkRetry(3, () => {
        return agent.upsertProfile(prev => {
          const next: Un$Typed<AppBskyActorProfile.Record> = prev || {}
          next.createdAt = prev?.createdAt || new Date().toISOString()
          return next
        })
      }).catch(e => {
        logger.info(
          `createAgentAndCreateAccount: failed to set initial profile`,
        )
        throw e
      }),
    ]).then(promises => {
      const rejected = promises.filter(p => p.status === 'rejected')
      if (rejected.length > 0) {
        logger.error(
          `session: createAgentAndCreateAccount failed to save personal details and feeds`,
        )
      }
    })
  }

  try {
    // snooze first prompt after signup, defer to next prompt
    snoozeEmailConfirmationPrompt()
  } catch (e: any) {
    logger.error(e, {message: `session: failed snoozeEmailConfirmationPrompt`})
  }

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  // The appview occasionally misses the new-account event and never indexes the
  // account. Kick off a background self-heal that re-emits the identity event if
  // the profile never shows up. Not awaited — must not block onboarding.
  void verifyAndRepairAccountIndexing(agent, account.did)

  return agent.prepare({
    resolvers: [gates, moderation],
    onSessionChange,
  })
}

export function agentToSessionAccountOrThrow(agent: BskyAgent): SessionAccount {
  const account = agentToSessionAccount(agent)
  if (!account) {
    throw Error('Expected an active session')
  }
  return account
}

export function agentToSessionAccount(
  agent: BskyAgent,
): SessionAccount | undefined {
  if (!agent.session) {
    return undefined
  }
  return {
    service: agent.serviceUrl.toString(),
    did: agent.session.did,
    handle: agent.session.handle,
    email: agent.session.email,
    emailConfirmed: agent.session.emailConfirmed || false,
    emailAuthFactor: agent.session.emailAuthFactor || false,
    refreshJwt: agent.session.refreshJwt,
    accessJwt: agent.session.accessJwt,
    signupQueued: isSignupQueued(agent.session.accessJwt),
    active: agent.session.active,
    status: agent.session.status,
    pdsUrl: agent.pdsUrl?.toString(),
    isSelfHosted: !agent.serviceUrl.toString().startsWith(BSKY_SERVICE),
  }
}

export function sessionAccountToSession(
  account: SessionAccount,
): AtpSessionData {
  return {
    // Sorted in the same property order as when returned by BskyAgent (alphabetical).
    accessJwt: account.accessJwt ?? '',
    did: account.did,
    email: account.email,
    emailAuthFactor: account.emailAuthFactor,
    emailConfirmed: account.emailConfirmed,
    handle: account.handle,
    refreshJwt: account.refreshJwt ?? '',
    /**
     * @see https://github.com/bluesky-social/atproto/blob/c5d36d5ba2a2c2a5c4f366a5621c06a5608e361e/packages/api/src/agent.ts#L188
     */
    active: account.active ?? true,
    status: account.status,
  }
}

export class Agent extends BaseAgent {
  constructor(
    proxyHeader: ProxyHeaderValue | null,
    options: SessionManager | FetchHandler | FetchHandlerOptions,
  ) {
    super(options)
    if (proxyHeader) {
      this.configureProxy(proxyHeader)
    }
  }
}

// Not exported. Use factories above to create it.
// WARN: In the factories above, we _manually set a proxy header_ for the agent after we do whatever it is we are supposed to do.
// Ideally, we wouldn't be doing this. However, since there is so much logic that requires making calls to the PDS right now, it
// feels safer to just let those run as-is and set the header afterward.
// app.bsky.actor.getPreferences / putPreferences are PDS-local methods. The
// agent's global appview proxy header must not reach them for a PDS whose home
// appview differs from ours: that PDS honors the header and forwards the call to
// our appview, which 501s - breaking app load for accounts hosted elsewhere
// (e.g. bsky.network).
//
// This is only used by the OAuth agent, which is the only path a foreign PDS is
// ever reached on. Accounts on our own PDS never need this: that PDS serves the
// methods locally and its gatekeeper strips the header server-side anyway.
// (The Bearer agent - account creation + legacy resume, always on our PDS -
// deliberately does NOT strip; doing so produced a bare 401 on fresh signups.)
const PDS_LOCAL_PROXY_EXEMPT_METHODS = [
  'app.bsky.actor.getPreferences',
  'app.bsky.actor.putPreferences',
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

let realFetch = globalThis.fetch
class BskyAppAgent extends BskyAgent {
  persistSessionHandler: ((event: AtpSessionEvent) => void) | undefined =
    undefined

  constructor({service}: {service: string}) {
    super({
      service,
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        // NOTE: the appview proxy header is deliberately NOT stripped here.
        // This (Bearer) agent is only ever used for account creation and legacy
        // session resume - both always on this deployment's own PDS, whose home
        // appview is ours, so it serves getPreferences/putPreferences locally
        // (the PDS gatekeeper also strips the header server-side). Stripping it
        // client-side here instead produced a bare 401 on fresh signups. The
        // strip is only needed for foreign PDSes, which are only ever reached
        // via the OAuth agent - see stripAppviewProxyForPdsLocalMethods.
        let success = false
        try {
          const result = await realFetch(input, init)
          success = true
          return result
        } catch (e) {
          success = false
          throw e
        } finally {
          if (success) {
            emitNetworkConfirmed()
          } else {
            emitNetworkLost()
          }
        }
      },
      persistSession: (event: AtpSessionEvent) => {
        if (this.persistSessionHandler) {
          this.persistSessionHandler(event)
        }
      },
    })
  }

  async prepare({
    resolvers,
    onSessionChange,
  }: {
    // Not awaited in the calling code so we can delay blocking on them.
    resolvers: Promise<unknown>[]
    onSessionChange: (
      agent: BskyAgent,
      did: string,
      event: AtpSessionEvent,
    ) => void
  }) {
    // There's nothing else left to do, so block on them here.
    await Promise.all(resolvers)

    // Now the agent is ready.
    const account = agentToSessionAccountOrThrow(this)
    this.persistSessionHandler = event => {
      onSessionChange(this, account.did, event)
      if (event !== 'create' && event !== 'update') {
        addSessionErrorLog(account.did, event)
      }
    }
    return {account, agent: this}
  }

  dispose() {
    this.sessionManager.session = undefined
    this.persistSessionHandler = undefined
  }
}

export type {BskyAppAgent}
