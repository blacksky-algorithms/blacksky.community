import {type PropsWithChildren} from 'react'
import {AppState} from 'react-native'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockGetUnreadCount = jest.fn()
const mockFetchPage = jest.fn()
const mockResetBadgeCount = jest.fn()
const mockTruncateAndInvalidate = jest.fn()
const mockUpdateSeen = jest.fn().mockResolvedValue(undefined)
const mockBroadcastPostMessage = jest.fn()
let mockBroadcastListener: ((event: MessageEvent) => void) | undefined
const mockAgent = {
  session: {did: 'did:plc:viewer'},
  app: {
    bsky: {
      notification: {updateSeen: mockUpdateSeen},
    },
  },
}

jest.mock('#/lib/api/community-notifications', () => ({
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
}))
jest.mock('#/lib/broadcast', () =>
  jest.fn().mockImplementation(() => ({
    postMessage: (...args: unknown[]) => mockBroadcastPostMessage(...args),
    addEventListener: (
      _type: string,
      listener: (event: MessageEvent) => void,
    ) => {
      mockBroadcastListener = listener
    },
    removeEventListener: (
      _type: string,
      listener: (event: MessageEvent) => void,
    ) => {
      if (mockBroadcastListener === listener) mockBroadcastListener = undefined
    },
  })),
)
jest.mock('#/lib/notifications/notifications', () => ({
  resetBadgeCount: () => mockResetBadgeCount(),
}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: () => undefined,
}))
jest.mock('#/state/queries/util', () => ({
  truncateAndInvalidate: (...args: unknown[]) =>
    mockTruncateAndInvalidate(...args),
}))
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
  useSession: () => ({hasSession: false}),
}))
jest.mock('../util', () => ({
  fetchPage: (...args: unknown[]) => mockFetchPage(...args),
}))

import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {type FeedPage} from '../types'
import {
  Provider,
  useUnreadNotifications,
  useUnreadNotificationsApi,
} from '../unread'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

const page: FeedPage = {
  cursor: 'next',
  seenAt: new Date('2026-09-01T00:00:00.000Z'),
  items: [],
  priority: false,
}

describe('notification unread synchronization', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastListener = undefined
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    })
    queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    })
  })

  function wrapper({children}: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <Provider>{children}</Provider>
      </QueryClientProvider>
    )
  }

  function setup() {
    return renderHook(
      () => ({
        count: useUnreadNotifications(),
        api: useUnreadNotificationsApi(),
      }),
      {wrapper},
    )
  }

  it('uses count-only polling without fetching or hydrating a page', async () => {
    mockGetUnreadCount.mockResolvedValue({count: 6})
    const {result} = setup()

    await act(() => result.current.api.checkUnread())

    expect(result.current.count).toBe('6')
    expect(mockFetchPage).not.toHaveBeenCalled()
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()
  })

  it('commits an invalidating page and authoritative count only after both resolve', async () => {
    const countRequest = deferred<{count: number}>()
    const pageRequest = deferred<{page: FeedPage; indexedAt: string}>()
    mockGetUnreadCount.mockReturnValue(countRequest.promise)
    mockFetchPage.mockReturnValue(pageRequest.promise)
    const {result} = setup()

    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.api.checkUnread({invalidate: true})
    })
    pageRequest.resolve({
      page,
      indexedAt: '2099-09-01T00:00:00.000Z',
    })
    await act(async () => Promise.resolve())
    expect(result.current.count).toBe('')
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()

    countRequest.resolve({count: 7})
    await act(() => refresh)

    expect(result.current.count).toBe('7')
    expect(result.current.api.getCachedUnreadPage()).toBe(page)
    expect(mockFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({fetchAdditionalData: true, reasons: []}),
    )
    expect(mockTruncateAndInvalidate).toHaveBeenCalledTimes(2)
  })

  it.each(['count', 'page'] as const)(
    'preserves the prior badge and cache when the %s request fails',
    async failure => {
      mockGetUnreadCount.mockResolvedValueOnce({count: 3})
      mockFetchPage.mockResolvedValueOnce({
        page,
        indexedAt: '2026-09-01T00:00:00.000Z',
      })
      const {result} = setup()
      await act(() => result.current.api.checkUnread({invalidate: true}))
      expect(result.current.count).toBe('3')

      const error = new Error(`${failure} failed`)
      mockGetUnreadCount.mockImplementationOnce(() =>
        failure === 'count'
          ? Promise.reject(error)
          : Promise.resolve({count: 9}),
      )
      mockFetchPage.mockImplementationOnce(() =>
        failure === 'page'
          ? Promise.reject(error)
          : Promise.resolve({page: {...page, cursor: 'new'}, indexedAt: ''}),
      )

      await expect(
        act(() => result.current.api.checkUnread({invalidate: true})),
      ).rejects.toBe(error)
      expect(result.current.count).toBe('3')
      expect(result.current.api.getCachedUnreadPage()).toBe(page)
    },
  )

  it('prevents an older refresh from resurrecting the badge after mark-all-read', async () => {
    const countRequest = deferred<{count: number}>()
    const pageRequest = deferred<{page: FeedPage; indexedAt: string}>()
    mockGetUnreadCount.mockReturnValue(countRequest.promise)
    mockFetchPage.mockReturnValue(pageRequest.promise)
    const {result} = setup()

    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.api.checkUnread({invalidate: true})
    })
    await act(() => result.current.api.markAllRead())
    countRequest.resolve({count: 12})
    pageRequest.resolve({
      page,
      indexedAt: '2099-09-01T00:00:00.000Z',
    })
    await act(() => refresh)

    expect(result.current.count).toBe('')
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()
    expect(mockUpdateSeen).toHaveBeenCalledWith(
      {seenAt: expect.any(String)},
      HOME_APPVIEW_PINNED_OPTS,
    )
    expect(mockResetBadgeCount).toHaveBeenCalledTimes(1)
  })

  it('prevents an older refresh from overwriting a broadcast badge', async () => {
    const countRequest = deferred<{count: number}>()
    const pageRequest = deferred<{page: FeedPage; indexedAt: string}>()
    mockGetUnreadCount.mockReturnValue(countRequest.promise)
    mockFetchPage.mockReturnValue(pageRequest.promise)
    const {result} = setup()

    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.api.checkUnread({invalidate: true})
    })
    act(() => {
      mockBroadcastListener?.({data: {event: '4'}} as MessageEvent)
    })
    expect(result.current.count).toBe('4')

    countRequest.resolve({count: 12})
    pageRequest.resolve({
      page,
      indexedAt: '2099-09-01T00:00:00.000Z',
    })
    await act(() => refresh)

    expect(result.current.count).toBe('4')
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()
  })
})
