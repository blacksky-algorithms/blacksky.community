import {type BskyAgent} from '@atproto/api'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  CHAT_NOTIF_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {communityXrpc} from '../community'

describe('communityXrpc', () => {
  const originalHeader = BLUESKY_PROXY_HEADER.get()

  afterEach(() => {
    BLUESKY_PROXY_HEADER.set(originalHeader)
  })

  function mockAgent() {
    const fetchHandler = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
    fetchHandler.mockResolvedValue(new Response('{}'))
    return {agent: {fetchHandler} as unknown as BskyAgent, fetchHandler}
  }

  it('always targets the home appview, even when the global proxy header is flipped', async () => {
    BLUESKY_PROXY_HEADER.set(BLUESKY_FALLBACK_PROXY_HEADER)
    const {agent, fetchHandler} = mockAgent()

    await communityXrpc(agent, 'community.blacksky.feed.getCommunityTimeline')

    const init = fetchHandler.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers['atproto-proxy']).toBe(HOME_PROXY_HEADER)
    expect(init.headers['atproto-proxy']).not.toBe(
      BLUESKY_FALLBACK_PROXY_HEADER,
    )
  })

  it('allows relay XRPCs to target the dedicated chat notification service', async () => {
    const {agent, fetchHandler} = mockAgent()

    await communityXrpc(agent, 'chat.bsky.notification.getPreferences', {
      proxyHeader: CHAT_NOTIF_PROXY_HEADER,
    })

    const init = fetchHandler.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers['atproto-proxy']).toBe(CHAT_NOTIF_PROXY_HEADER)
  })
})

describe('development Courier routing', () => {
  const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__')
  const originalUrl = process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL
  const originalFetch = globalThis.fetch
  let directFetch: jest.Mock<Promise<Response>, Parameters<typeof fetch>>
  let getServiceAuth: jest.Mock<
    Promise<{data: {token: string}}>,
    [{aud: string; lxm: string; exp: number}, unknown]
  >
  let pdsFetch: jest.Mock
  let agent: BskyAgent

  beforeEach(() => {
    Object.defineProperty(globalThis, '__DEV__', {
      value: true,
      configurable: true,
    })
    process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL = 'https://courier-test.example'
    directFetch = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response('{}'))
    globalThis.fetch = directFetch
    getServiceAuth = jest
      .fn<
        Promise<{data: {token: string}}>,
        [{aud: string; lxm: string; exp: number}, unknown]
      >()
      .mockResolvedValue({data: {token: 'method-bound-service-token'}})
    pdsFetch = jest.fn().mockResolvedValue(new Response('{}'))
    agent = {
      fetchHandler: pdsFetch,
      com: {atproto: {server: {getServiceAuth}}},
    } as unknown as BskyAgent
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev)
    if (originalUrl === undefined)
      delete process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL
    else process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL = originalUrl
  })

  it('requests exact-method service auth and sends only that token to Courier', async () => {
    const method = 'chat.bsky.notification.putPreferences'
    const body = {chat: {push: false}}
    await communityXrpc(agent, method, {
      proxyHeader: CHAT_NOTIF_PROXY_HEADER,
      body,
    })
    expect(getServiceAuth).toHaveBeenCalledWith(
      {
        aud: 'did:web:api.blacksky.community',
        lxm: method,
        exp: expect.any(Number),
      },
      expect.objectContaining({headers: {'atproto-proxy': undefined}}),
    )
    expect(getServiceAuth.mock.calls[0][0].exp).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 60,
    )
    expect(directFetch).toHaveBeenCalledWith(
      `https://courier-test.example/xrpc/${method}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({
          authorization: 'Bearer method-bound-service-token',
          'content-type': 'application/json',
        }),
      }),
    )
    expect(
      new Headers(directFetch.mock.calls[0][1]?.headers).get('atproto-proxy'),
    ).toBeNull()
    expect(pdsFetch).not.toHaveBeenCalled()
  })

  it('preserves GET query parameters', async () => {
    await communityXrpc(
      agent,
      'community.blacksky.courier.getEnrollmentStatus',
      {proxyHeader: CHAT_NOTIF_PROXY_HEADER, params: {test: 'a b'}},
    )
    expect(directFetch.mock.calls[0][0]).toContain('?test=a+b')
    expect(directFetch.mock.calls[0][1]?.method).toBe('GET')
    expect(directFetch.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('never uses the override in release builds', async () => {
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
    })
    await communityXrpc(agent, 'chat.bsky.notification.getPreferences', {
      proxyHeader: CHAT_NOTIF_PROXY_HEADER,
    })
    expect(pdsFetch).toHaveBeenCalledTimes(1)
    expect(getServiceAuth).not.toHaveBeenCalled()
    expect(directFetch).not.toHaveBeenCalled()
  })

  it('leaves other community services on their normal PDS route', async () => {
    await communityXrpc(agent, 'community.blacksky.feed.getCommunityTimeline')
    expect(pdsFetch).toHaveBeenCalledTimes(1)
    expect(getServiceAuth).not.toHaveBeenCalled()
  })

  it.each([
    'http://external.example',
    'https://user:password@courier-test.example',
    'https://courier-test.example/path',
  ])('rejects an unsafe endpoint %s before requesting a token', async url => {
    process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL = url
    await expect(
      communityXrpc(agent, 'chat.bsky.notification.getPreferences', {
        proxyHeader: CHAT_NOTIF_PROXY_HEADER,
      }),
    ).rejects.toThrow()
    expect(getServiceAuth).not.toHaveBeenCalled()
    expect(directFetch).not.toHaveBeenCalled()
  })

  it('does not send a request if PDS authorization fails', async () => {
    getServiceAuth.mockRejectedValueOnce(new Error('No session'))
    await expect(
      communityXrpc(agent, 'chat.bsky.notification.getPreferences', {
        proxyHeader: CHAT_NOTIF_PROXY_HEADER,
      }),
    ).rejects.toThrow('No session')
    expect(directFetch).not.toHaveBeenCalled()
  })
})
