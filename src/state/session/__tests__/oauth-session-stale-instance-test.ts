import {OAuthSession} from '@atproto/oauth-client'
import {describe, expect, it, jest} from '@jest/globals'

const SUB = 'did:plc:test'

function fakeKey(x: string) {
  return {bareJwk: {kty: 'EC', crv: 'P-256', x, y: 'y'}}
}

function tokenSet(accessToken: string) {
  return {
    sub: SUB,
    iss: 'https://pds.test',
    aud: 'https://pds.test',
    token_type: 'DPoP',
    access_token: accessToken,
    refresh_token: 'refresh',
    scope: 'atproto',
  }
}

function invalidTokenResponse() {
  return new Response(null, {
    status: 401,
    headers: {
      'WWW-Authenticate':
        'DPoP error="invalid_token", error_description="DPoP key does not match the token binding"',
    },
  })
}

function okResponse() {
  return new Response('{}', {status: 200})
}

function makeSession({
  instanceKey,
  storedKey,
  responses,
}: {
  instanceKey: ReturnType<typeof fakeKey>
  storedKey: ReturnType<typeof fakeKey> | undefined
  responses: Response[]
}) {
  const refresh = jest.fn(() => Promise.resolve({tokenSet: tokenSet('fresh')}))
  const sessionGetter = {
    getSession: jest.fn((_sub: string, force?: boolean | 'auto') =>
      force === true
        ? refresh()
        : Promise.resolve({tokenSet: tokenSet('current')}),
    ),
    getStored: jest.fn(() =>
      Promise.resolve(
        storedKey
          ? {dpopKey: storedKey, tokenSet: tokenSet('current')}
          : undefined,
      ),
    ),
    delStored: jest.fn(() => Promise.resolve()),
  }
  const session = Object.create(OAuthSession.prototype) as OAuthSession
  Object.assign(session, {
    server: {dpopKey: instanceKey},
    sub: SUB,
    sessionGetter,
    dpopFetch: jest.fn(() => Promise.resolve(responses.shift()!)),
  })
  return {session, sessionGetter, refresh}
}

describe('OAuthSession stale-instance guard', () => {
  it('does not refresh or delete when the store holds a different DPoP key', async () => {
    const {session, sessionGetter, refresh} = makeSession({
      instanceKey: fakeKey('old'),
      storedKey: fakeKey('new'),
      responses: [invalidTokenResponse()],
    })

    const res = await session.fetchHandler('/xrpc/chat.bsky.convo.getLog', {})

    expect(res.status).toBe(401)
    expect(refresh).not.toHaveBeenCalled()
    expect(sessionGetter.delStored).not.toHaveBeenCalled()
  })

  it('still deletes the session when the owning instance is rejected twice', async () => {
    const {session, sessionGetter, refresh} = makeSession({
      instanceKey: fakeKey('same'),
      storedKey: fakeKey('same'),
      responses: [invalidTokenResponse(), invalidTokenResponse()],
    })

    const res = await session.fetchHandler(
      '/xrpc/app.bsky.actor.getPreferences',
      {},
    )

    expect(res.status).toBe(401)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionGetter.delStored).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries when the owning instance holds an expired token', async () => {
    const {session, sessionGetter, refresh} = makeSession({
      instanceKey: fakeKey('same'),
      storedKey: fakeKey('same'),
      responses: [invalidTokenResponse(), okResponse()],
    })

    const res = await session.fetchHandler(
      '/xrpc/app.bsky.actor.getPreferences',
      {},
    )

    expect(res.status).toBe(200)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionGetter.delStored).not.toHaveBeenCalled()
  })

  it('keeps the upstream behavior when nothing is stored', async () => {
    const {session, sessionGetter, refresh} = makeSession({
      instanceKey: fakeKey('same'),
      storedKey: undefined,
      responses: [invalidTokenResponse(), invalidTokenResponse()],
    })

    await session.fetchHandler('/xrpc/app.bsky.actor.getPreferences', {})

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionGetter.delStored).toHaveBeenCalledTimes(1)
  })
})
