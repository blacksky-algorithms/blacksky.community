import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook, waitFor} from '@testing-library/react-native'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_APPVIEW_PINNED_OPTS,
} from '#/lib/constants'

const mockQueryLabels = jest.fn()
const mockCommunityXrpc = jest.fn()
const mockWarn = jest.fn()
const mockAgent = {
  com: {atproto: {label: {queryLabels: mockQueryLabels}}},
}

jest.mock('#/lib/api/community', () => ({
  communityXrpc: (...args: unknown[]) => mockCommunityXrpc(...args),
}))
jest.mock('#/logger', () => ({
  logger: {warn: (...args: unknown[]) => mockWarn(...args)},
}))
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
}))
jest.mock('#/state/queries/community-feed', () => ({
  COMMUNITY_POST_RQKEY: (uri: string) => ['community-post', uri],
  RQKEY_ROOT: 'community-feed',
  TIMELINE_RQKEY: () => ['community-timeline'],
}))
jest.mock('#/state/queries/post', () => ({
  RQKEY: (uri: string) => ['post', uri],
}))
jest.mock('#/state/queries/post-feed', () => ({RQKEY_ROOT: 'post-feed'}))

import {
  useApplyLabelMutation,
  usePostBlackskyLabelsQuery,
  useRemoveLabelMutation,
} from '../peer-mod-label'

const URI = 'at://did:plc:author/app.bsky.feed.post/3kpost'
const CID = 'bafyreipost'
const INTERVAL = 750
const REQUEST_TIMEOUT = 3000
const ATTEMPTS = 8
const RENDER_KEYS = [['post', URI], ['post-feed'], ['post-thread-v2']]

const labelsResponse = (vals: string[]) => ({
  data: {labels: vals.map(val => ({val, uri: URI, src: 'did:plc:mod'}))},
})

function setup() {
  const client = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({children}: React.PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {client, invalidate, wrapper}
}

const invalidatedKeys = (invalidate: jest.SpyInstance) =>
  invalidate.mock.calls.map(
    ([filters]: [{queryKey?: unknown}]) => filters.queryKey,
  )

const expectRenderCachesInvalidated = (
  invalidate: jest.SpyInstance,
  times: number,
) => {
  for (const key of RENDER_KEYS) {
    expect(
      invalidatedKeys(invalidate).filter(
        k => JSON.stringify(k) === JSON.stringify(key),
      ),
    ).toHaveLength(times)
  }
}

async function applyLabel(
  wrapper: React.ComponentType<React.PropsWithChildren>,
) {
  const {result} = renderHook(() => useApplyLabelMutation(), {wrapper})
  let pollsWhenResolved = -1
  await act(async () => {
    await result.current.mutateAsync({
      subjectUri: URI,
      subjectCid: CID,
      val: 'porn',
    })
    pollsWhenResolved = mockQueryLabels.mock.calls.length
  })
  return {result, pollsWhenResolved}
}

describe('peer-mod label reconciliation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    mockCommunityXrpc.mockResolvedValue({ok: true})
    BLUESKY_PROXY_HEADER.set(BLUESKY_FALLBACK_PROXY_HEADER)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('refreshes the render caches once the appview reports the label', async () => {
    const {invalidate, wrapper} = setup()
    mockQueryLabels
      .mockResolvedValueOnce(labelsResponse([]))
      .mockResolvedValueOnce(labelsResponse(['porn']))

    const {pollsWhenResolved} = await applyLabel(wrapper)

    expect(pollsWhenResolved).toBeLessThanOrEqual(1)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })
    expect(mockQueryLabels).toHaveBeenCalledTimes(1)
    expectRenderCachesInvalidated(invalidate, 0)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(INTERVAL)
    })

    expect(mockQueryLabels).toHaveBeenCalledTimes(2)
    expectRenderCachesInvalidated(invalidate, 1)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('pins every label lookup to the home appview while fallback is active', async () => {
    const {wrapper} = setup()
    mockQueryLabels.mockResolvedValue(labelsResponse(['porn']))

    const {result} = renderHook(() => usePostBlackskyLabelsQuery(URI), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data).toEqual(['porn']))
    await applyLabel(wrapper)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    expect(BLUESKY_PROXY_HEADER.get()).toBe(BLUESKY_FALLBACK_PROXY_HEADER)
    expect(mockQueryLabels.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const [, opts] of mockQueryLabels.mock.calls as Array<
      [unknown, {headers?: unknown}]
    >) {
      expect(opts.headers).toEqual(HOME_APPVIEW_PINNED_OPTS.headers)
    }
  })

  it('gives up after the last attempt and still refreshes', async () => {
    const {invalidate, wrapper} = setup()
    mockQueryLabels.mockResolvedValue(labelsResponse([]))

    await applyLabel(wrapper)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(INTERVAL * ATTEMPTS)
    })

    expect(mockQueryLabels).toHaveBeenCalledTimes(ATTEMPTS)
    expectRenderCachesInvalidated(invalidate, 1)
    expect(mockWarn).toHaveBeenCalledWith(
      'peer-mod label reconcile did not converge',
      expect.objectContaining({subjectUri: URI, val: 'porn'}),
    )
  })

  it('survives a rejected lookup and keeps polling', async () => {
    const {invalidate, wrapper} = setup()
    mockQueryLabels
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(labelsResponse(['porn']))

    await applyLabel(wrapper)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(INTERVAL)
    })

    expect(mockQueryLabels).toHaveBeenCalledTimes(2)
    expectRenderCachesInvalidated(invalidate, 1)
    expect(mockWarn).toHaveBeenCalledWith(
      'peer-mod label reconcile attempt failed',
      expect.objectContaining({attempt: 1, message: 'boom'}),
    )
  })

  it('times out a lookup that never settles, even one ignoring its signal', async () => {
    const {invalidate, wrapper} = setup()
    let stalledSignal: AbortSignal | undefined
    mockQueryLabels
      .mockImplementationOnce(
        (_params: unknown, opts: {signal: AbortSignal}) => {
          stalledSignal = opts.signal
          return new Promise(() => {})
        },
      )
      .mockResolvedValueOnce(labelsResponse(['porn']))

    await applyLabel(wrapper)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT - 1)
    })
    expect(mockQueryLabels).toHaveBeenCalledTimes(1)
    expect(stalledSignal?.aborted).toBe(false)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1 + INTERVAL)
    })

    expect(stalledSignal?.aborted).toBe(true)
    expect(mockQueryLabels).toHaveBeenCalledTimes(2)
    expectRenderCachesInvalidated(invalidate, 1)
    expect(mockWarn).toHaveBeenCalledWith(
      'peer-mod label reconcile attempt failed',
      expect.objectContaining({attempt: 1, message: 'Timed out after 3000ms'}),
    )
  })

  it('converges on absence after a removal', async () => {
    const {invalidate, wrapper} = setup()
    mockQueryLabels
      .mockResolvedValueOnce(labelsResponse(['porn']))
      .mockResolvedValueOnce(labelsResponse([]))
    const {result} = renderHook(() => useRemoveLabelMutation(), {wrapper})

    await act(async () => {
      await result.current.mutateAsync({subjectUri: URI, val: 'porn'})
    })
    await act(async () => {
      await jest.advanceTimersByTimeAsync(INTERVAL)
    })

    expect(mockQueryLabels).toHaveBeenCalledTimes(2)
    expectRenderCachesInvalidated(invalidate, 1)
  })
})
