import {type Agent} from '@atproto/lex'
import {type QueryClient} from '@tanstack/react-query'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {buildAppviewClient} from '#/state/session/clients'
import {app} from '#/lexicons'
import {
  isFallbackActive,
  setFallbackActive,
  subscribe,
} from '../appview-fallback'

jest.mock('#/analytics/metrics', () => ({metrics: {track: jest.fn()}}))
jest.mock('#/analytics/identifiers', () => ({
  getDeviceId: jest.fn(),
  getSessionId: jest.fn(),
}))

function mocks() {
  const resetQueries = jest.fn().mockResolvedValue(undefined)
  return {
    queryClient: {resetQueries} as unknown as QueryClient,
    resetQueries,
  }
}

function liveClient() {
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({did: 'did:plc:alice', handle: 'alice.test'}),
        {headers: {'content-type': 'application/json'}},
      ),
    ),
  )
  const client = buildAppviewClient({
    did: 'did:plc:me',
    fetchHandler,
  } as unknown as Agent)
  const proxyOf = async () => {
    fetchHandler.mockClear()
    await client.call(app.bsky.actor.getProfile, {actor: 'alice.test'})
    return new Headers(fetchHandler.mock.calls[0][1].headers).get(
      'atproto-proxy',
    )
  }
  return {proxyOf}
}

describe('appview fallback state', () => {
  afterEach(() => {
    setFallbackActive(false, mocks().queryClient)
    BLUESKY_PROXY_HEADER.set(HOME_PROXY_HEADER)
  })

  it('activating flips the global header and resets the cache', () => {
    const {queryClient, resetQueries} = mocks()

    setFallbackActive(true, queryClient)

    expect(isFallbackActive()).toBe(true)
    expect(BLUESKY_PROXY_HEADER.get()).toBe(BLUESKY_FALLBACK_PROXY_HEADER)
    expect(resetQueries).toHaveBeenCalledTimes(1)
  })

  it('deactivating restores the home appview header', () => {
    setFallbackActive(true, mocks().queryClient)
    setFallbackActive(false, mocks().queryClient)

    expect(isFallbackActive()).toBe(false)
    expect(BLUESKY_PROXY_HEADER.get()).toBe(HOME_PROXY_HEADER)
  })

  it('setting the same value skips the reset', () => {
    const {queryClient, resetQueries} = mocks()

    setFallbackActive(false, queryClient)

    expect(BLUESKY_PROXY_HEADER.get()).toBe(HOME_PROXY_HEADER)
    expect(resetQueries).not.toHaveBeenCalled()
  })

  it('moves a live appview client with each flip', async () => {
    const {proxyOf} = liveClient()
    expect(await proxyOf()).toBe(HOME_PROXY_HEADER)

    setFallbackActive(true, mocks().queryClient)
    expect(await proxyOf()).toBe(BLUESKY_FALLBACK_PROXY_HEADER)

    setFallbackActive(false, mocks().queryClient)
    expect(await proxyOf()).toBe(HOME_PROXY_HEADER)
  })

  it('a client built after activation targets the fallback appview', async () => {
    setFallbackActive(true, mocks().queryClient)

    expect(await liveClient().proxyOf()).toBe(BLUESKY_FALLBACK_PROXY_HEADER)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const {queryClient} = mocks()
    const fn = jest.fn()
    const unsub = subscribe(fn)

    setFallbackActive(true, queryClient)
    expect(fn).toHaveBeenCalledTimes(1)

    unsub()
    setFallbackActive(false, queryClient)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
