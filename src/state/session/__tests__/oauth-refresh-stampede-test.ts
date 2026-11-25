import {OAuthSession} from '@atproto/oauth-client'
import {describe, expect, it, jest} from '@jest/globals'

const SUB = 'did:plc:test'

function tokenSet(accessToken: string) {
  return {
    sub: SUB,
    iss: 'https://pds.test',
    aud: 'https://pds.test',
    token_type: 'DPoP',
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    scope: 'atproto',
  }
}

function invalidToken() {
  return new Response(null, {
    status: 401,
    headers: {
      'WWW-Authenticate':
        'DPoP error="invalid_token", error_description="Invalid token"',
    },
  })
}

function ok() {
  return new Response('{}', {status: 200})
}

function makeSession(
  respond: (accessToken: string, store: {current: string}) => Response,
) {
  const store = {current: 'a1'}
  let rotations = 0
  const refresh = jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    store.current = `a${++rotations + 1}`
    return {tokenSet: tokenSet(store.current)}
  })
  const sessionGetter = {
    getSession: jest.fn((_sub: string, force?: boolean | 'auto') =>
      force === true
        ? refresh()
        : Promise.resolve({tokenSet: tokenSet(store.current)}),
    ),
    getStored: jest.fn(() => Promise.resolve(undefined)),
    delStored: jest.fn(() => Promise.resolve()),
  }
  const sentTokens: string[] = []
  const session = Object.create(OAuthSession.prototype) as OAuthSession
  Object.assign(session, {
    sub: SUB,
    sessionGetter,
    dpopFetch: jest.fn((_url: URL, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization')!
      const accessToken = auth.split(' ')[1]
      sentTokens.push(accessToken)
      return Promise.resolve(respond(accessToken, store))
    }),
  })
  return {session, sessionGetter, refresh, store, sentTokens}
}

const acceptCurrent = (accessToken: string, store: {current: string}) =>
  accessToken === store.current ? ok() : invalidToken()

describe('OAuthSession refresh after a rejected access token', () => {
  it('refreshes once for concurrent 401s and retries all of them', async () => {
    const {session, refresh, sessionGetter, sentTokens} = makeSession(
      (accessToken, s) =>
        accessToken === 'a1' ? invalidToken() : acceptCurrent(accessToken, s),
    )
    const first = session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {})
    const second = session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {})

    const responses = await Promise.all([first, second])

    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sentTokens).toEqual(['a1', 'a1', 'a2', 'a2'])
    expect(sessionGetter.delStored).not.toHaveBeenCalled()
  })

  it('reuses a token another request already refreshed', async () => {
    const {session, refresh, sentTokens} = makeSession((accessToken, s) => {
      if (accessToken === 'a1') {
        s.current = 'a9'
        return invalidToken()
      }
      return acceptCurrent(accessToken, s)
    })

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(200)
    expect(refresh).not.toHaveBeenCalled()
    expect(sentTokens).toEqual(['a1', 'a9'])
  })

  it('keeps the session when the retry was made with a replaced token', async () => {
    const {session, refresh, sessionGetter} = makeSession((accessToken, s) => {
      if (accessToken === 'a2') {
        s.current = 'a3'
      }
      return invalidToken()
    })

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(401)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionGetter.delStored).not.toHaveBeenCalled()
  })

  it('deletes the session when the current token is rejected after a refresh', async () => {
    const {session, refresh, sessionGetter} = makeSession(() => invalidToken())

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(401)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionGetter.delStored).toHaveBeenCalledTimes(1)
  })
})
