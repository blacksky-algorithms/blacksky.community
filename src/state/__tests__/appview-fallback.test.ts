import {type BskyAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {
  isFallbackActive,
  setFallbackActive,
  subscribe,
} from '../appview-fallback'

function mocks() {
  const configureProxy = jest.fn()
  const resetQueries = jest.fn().mockResolvedValue(undefined)
  return {
    agent: {configureProxy} as unknown as BskyAgent,
    queryClient: {resetQueries} as unknown as QueryClient,
    configureProxy,
    resetQueries,
  }
}

describe('appview fallback state', () => {
  afterEach(() => {
    const {agent, queryClient} = mocks()
    setFallbackActive(false, agent, queryClient)
    BLUESKY_PROXY_HEADER.set(HOME_PROXY_HEADER)
  })

  it('activating flips the global header, live agent, and resets the cache', () => {
    const {agent, queryClient, configureProxy, resetQueries} = mocks()

    setFallbackActive(true, agent, queryClient)

    expect(isFallbackActive()).toBe(true)
    expect(BLUESKY_PROXY_HEADER.get()).toBe(BLUESKY_FALLBACK_PROXY_HEADER)
    expect(configureProxy).toHaveBeenCalledWith(BLUESKY_FALLBACK_PROXY_HEADER)
    expect(resetQueries).toHaveBeenCalledTimes(1)
  })

  it('deactivating restores the home appview header', () => {
    const first = mocks()
    setFallbackActive(true, first.agent, first.queryClient)

    const second = mocks()
    setFallbackActive(false, second.agent, second.queryClient)

    expect(isFallbackActive()).toBe(false)
    expect(BLUESKY_PROXY_HEADER.get()).toBe(HOME_PROXY_HEADER)
    expect(second.configureProxy).toHaveBeenCalledWith(HOME_PROXY_HEADER)
  })

  it('setting the same value is a no-op', () => {
    const {agent, queryClient, configureProxy, resetQueries} = mocks()

    setFallbackActive(false, agent, queryClient)

    expect(configureProxy).not.toHaveBeenCalled()
    expect(resetQueries).not.toHaveBeenCalled()
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const {agent, queryClient} = mocks()
    const fn = jest.fn()
    const unsub = subscribe(fn)

    setFallbackActive(true, agent, queryClient)
    expect(fn).toHaveBeenCalledTimes(1)

    unsub()
    setFallbackActive(false, agent, queryClient)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
