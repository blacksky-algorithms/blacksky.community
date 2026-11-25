import {
  OAuthSession,
  requestLocalLock,
  SessionGetter,
} from '@atproto/oauth-client'
import {describe, expect, it, jest} from '@jest/globals'

const SUB = 'did:plc:test'
const KEY = {bareJwk: {kty: 'EC', crv: 'P-256', x: 'k', y: 'y'}}

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

type Stored = {dpopKey: unknown; authMethod: unknown; tokenSet: unknown}

function makeStore() {
  const map = new Map<string, Stored>()
  map.set(SUB, {
    dpopKey: KEY,
    authMethod: {method: 'none'},
    tokenSet: tokenSet('a1'),
  })
  let rotations = 1
  const refresh = jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return tokenSet(`a${++rotations}`)
  })
  return {
    map,
    refresh,
    current: () =>
      (map.get(SUB)?.tokenSet as {access_token: string} | undefined)
        ?.access_token,
    replace: (accessToken: string) =>
      map.set(SUB, {...map.get(SUB)!, tokenSet: tokenSet(accessToken)}),
  }
}

type Store = ReturnType<typeof makeStore>

function makeTab(
  store: Store,
  respond: (accessToken: string, store: Store) => Response,
) {
  const onSessionDeleted = jest.fn()
  const getter = new SessionGetter(
    {
      get: (key: string) => Promise.resolve(store.map.get(key)),
      set: (key: string, value: Stored) => {
        store.map.set(key, value)
        return Promise.resolve()
      },
      del: (key: string) => {
        store.map.delete(key)
        return Promise.resolve()
      },
    } as never,
    {
      fromIssuer: () =>
        Promise.resolve({refresh: store.refresh, authMethod: {method: 'none'}}),
    } as never,
    {usingLock: requestLocalLock, hasImplementationLock: false} as never,
    {onSessionDeleted},
  )
  const sentTokens: string[] = []
  const session = Object.create(OAuthSession.prototype) as OAuthSession
  Object.assign(session, {
    server: {dpopKey: KEY},
    sub: SUB,
    sessionGetter: getter,
    dpopFetch: jest.fn((_url: URL, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization')!
      const accessToken = auth.split(' ')[1]
      sentTokens.push(accessToken)
      return Promise.resolve(respond(accessToken, store))
    }),
  })
  return {session, onSessionDeleted, sentTokens}
}

const acceptCurrent = (accessToken: string, store: Store) =>
  accessToken !== 'a1' && accessToken === store.current()
    ? ok()
    : invalidToken()

describe('OAuthSession refresh after a rejected access token', () => {
  it('refreshes once for concurrent 401s and retries all of them', async () => {
    const store = makeStore()
    const {session, onSessionDeleted, sentTokens} = makeTab(
      store,
      acceptCurrent,
    )

    const responses = await Promise.all([
      session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {}),
      session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {}),
    ])

    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(store.refresh).toHaveBeenCalledTimes(1)
    expect(sentTokens).toEqual(['a1', 'a1', 'a2', 'a2'])
    expect(onSessionDeleted).not.toHaveBeenCalled()
  })

  it('refreshes once when two tabs reject the same token', async () => {
    const store = makeStore()
    const tabA = makeTab(store, acceptCurrent)
    const tabB = makeTab(store, acceptCurrent)

    const responses = await Promise.all([
      tabA.session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {}),
      tabB.session.fetchHandler('/xrpc/app.bsky.actor.getProfile', {}),
    ])

    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(store.refresh).toHaveBeenCalledTimes(1)
  })

  it('reuses a token another request already refreshed', async () => {
    const store = makeStore()
    const {session, sentTokens} = makeTab(store, (accessToken, s) => {
      if (accessToken === 'a1') {
        s.replace('a9')
        return invalidToken()
      }
      return acceptCurrent(accessToken, s)
    })

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(200)
    expect(store.refresh).not.toHaveBeenCalled()
    expect(sentTokens).toEqual(['a1', 'a9'])
  })

  it('keeps the session when the retry was made with a replaced token', async () => {
    const store = makeStore()
    const {session, onSessionDeleted} = makeTab(store, (accessToken, s) => {
      if (accessToken === 'a2') {
        s.replace('a3')
      }
      return invalidToken()
    })

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(401)
    expect(store.refresh).toHaveBeenCalledTimes(1)
    expect(onSessionDeleted).not.toHaveBeenCalled()
    expect(store.current()).toBe('a3')
  })

  it('deletes the session when the current token is rejected after a refresh', async () => {
    const store = makeStore()
    const {session, onSessionDeleted} = makeTab(store, () => invalidToken())

    const res = await session.fetchHandler('/xrpc/app.bsky.feed.getPosts', {})

    expect(res.status).toBe(401)
    expect(store.refresh).toHaveBeenCalledTimes(1)
    expect(onSessionDeleted).toHaveBeenCalledTimes(1)
    expect(store.map.has(SUB)).toBe(false)
  })
})
