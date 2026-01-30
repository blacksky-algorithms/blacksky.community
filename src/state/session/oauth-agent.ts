import {Agent, type AtpSessionData} from '@atproto/api'
import {type OutputSchema} from '@atproto/api/dist/client/types/com/atproto/server/getSession'
import {type OAuthSession} from '@atproto/oauth-client-browser'

import {BLUESKY_PROXY_HEADER, BSKY_SERVICE} from '#/lib/constants'
import {logger} from '#/logger'
import {sessionAccountToSession} from './agent'
import {configureModerationForAccount} from './moderation'
import {getWebOAuthClient} from './oauth-web-client'
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

export async function oauthResumeSession(account: SessionAccount) {
  const client = getWebOAuthClient()
  const session = await client.restore(account.did)
  return await oauthCreateAgent(session)
}

export async function oauthAgentAndSessionToSessionAccountOrThrow(
  agent: Agent,
  session: OAuthSession,
): Promise<SessionAccount> {
  const account = await oauthAgentAndSessionToSessionAccount(agent, session)
  if (!account) {
    throw Error('Expected an active session')
  }
  return account
}

export async function oauthAgentAndSessionToSessionAccount(
  agent: Agent,
  session: OAuthSession,
): Promise<SessionAccount | undefined> {
  let data: OutputSchema
  try {
    const res = await agent.com.atproto.server.getSession()
    data = res.data
  } catch (e: any) {
    logger.error(e)
    return undefined
  }
  const {aud} = await session.getTokenInfo(false)
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

  #oauthSession: OAuthSession
  #account?: SessionAccount

  constructor(session: OAuthSession) {
    super(session)
    this.#oauthSession = session
  }

  async prepare(
    account: SessionAccount,
    gates: Promise<void>,
    moderation: Promise<void>,
  ) {
    this.#account = account
    this.session = sessionAccountToSession(account)
    this.dispatchUrl = account.pdsUrl
    this.configureProxy(BLUESKY_PROXY_HEADER.get())

    await Promise.all([gates, moderation])

    return {account, agent: this}
  }

  dispose() {}
}
