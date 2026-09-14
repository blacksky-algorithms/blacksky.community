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
  cursor: undefined,
  seenAt: new Date('2026-09-01T00:00:00.000Z'),
  items: [],
  priority: false,
}

const unreadNotification = {
  uri: 'at://did:plc:tenant/space/community.blacksky.feed/private/did:plc:alice/app.bsky.feed.post/3kprivate',
  cid: 'bafyreiacsg6vsw7ppwbnowzsdgstulhrwftirtcnvkcbnfgvhwjrnzfmsu',
  author: {did: 'did:plc:alice', handle: 'alice.test'},
  reason: 'mention',
  record: {$type: 'app.bsky.feed.post', text: 'private'},
  isRead: false,
  indexedAt: '2026-09-01T00:00:00.000Z',
}
const visiblePage: FeedPage = {
  ...page,
  items: [
    {
      _reactKey: 'private',
      type: 'mention',
      notification: unreadNotification,
      additional: [unreadNotification, {...unreadNotification, isRead: true}],
    },
    {
      _reactKey: 'read',
      type: 'mention',
      notification: {...unreadNotification, isRead: true},
    },
  ],
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

  it('clears the badge when the filtered list is empty', async () => {
    mockGetUnreadCount.mockResolvedValue({count: 6})
    mockFetchPage.mockResolvedValue({page, indexedAt: ''})
    const {result} = setup()
    await act(() => result.current.api.checkUnread())
    expect(result.current.count).toBe('')
    expect(mockGetUnreadCount).not.toHaveBeenCalled()
    expect(mockFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({fetchAdditionalData: false, reasons: []}),
    )
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()
  })

  it('counts only unread entries and unread members of groups', async () => {
    mockFetchPage.mockResolvedValue({page: visiblePage, indexedAt: ''})
    const {result} = setup()
    await act(() => result.current.api.checkUnread({invalidate: true}))
    expect(result.current.count).toBe('2')
    expect(result.current.api.getCachedUnreadPage()).toBe(visiblePage)
    expect(mockGetUnreadCount).not.toHaveBeenCalled()
    expect(mockFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({fetchAdditionalData: true, reasons: []}),
    )
    expect(mockTruncateAndInvalidate).toHaveBeenCalledTimes(2)
  })

  it('continues empty and sparse pages before caching the visible results', async () => {
    mockFetchPage
      .mockResolvedValueOnce({page: {...page, cursor: 'empty'}, indexedAt: ''})
      .mockResolvedValueOnce({
        page: {...visiblePage, cursor: 'sparse'},
        indexedAt: '2026-09-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({page: visiblePage, indexedAt: ''})
    const {result} = setup()
    await act(() => result.current.api.checkUnread({invalidate: true}))
    expect(result.current.count).toBe('4')
    for (const [index, cursor] of [undefined, 'empty', 'sparse'].entries()) {
      expect(mockFetchPage).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({cursor}),
      )
    }
    expect(result.current.api.getCachedUnreadPage()?.items).toHaveLength(4)
    expect(result.current.api.getCachedUnreadPage()?.cursor).toBeUndefined()
  })

  it('stops following a repeated cursor', async () => {
    mockFetchPage.mockResolvedValue({
      page: {...page, cursor: 'same'},
      indexedAt: '',
    })
    const {result} = setup()
    await act(() => result.current.api.checkUnread())
    expect(mockFetchPage).toHaveBeenCalledTimes(2)
    expect(result.current.count).toBe('')
  })

  it('bounds continuation through empty pages with unique cursors', async () => {
    let cursor = 0
    mockFetchPage.mockImplementation(() =>
      Promise.resolve({
        page: {...page, cursor: String(cursor++)},
        indexedAt: '',
      }),
    )
    const {result} = setup()
    await act(() => result.current.api.checkUnread())
    expect(mockFetchPage).toHaveBeenCalledTimes(4)
    expect(result.current.count).toBe('')
  })

  it('preserves the prior badge and cache when the page request fails', async () => {
    mockFetchPage.mockResolvedValueOnce({page: visiblePage, indexedAt: ''})
    const {result} = setup()
    await act(() => result.current.api.checkUnread({invalidate: true}))
    expect(result.current.count).toBe('2')
    const error = new Error('page failed')
    mockFetchPage.mockRejectedValueOnce(error)
    await expect(
      act(() => result.current.api.checkUnread({invalidate: true})),
    ).rejects.toBe(error)
    expect(result.current.count).toBe('2')
    expect(result.current.api.getCachedUnreadPage()).toBe(visiblePage)
  })

  it('prevents an older refresh from resurrecting the badge after mark-all-read', async () => {
    const pageRequest = deferred<{page: FeedPage; indexedAt: string}>()
    mockFetchPage.mockReturnValue(pageRequest.promise)
    const {result} = setup()

    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.api.checkUnread({invalidate: true})
    })
    await act(() => result.current.api.markAllRead())
    pageRequest.resolve({
      page: visiblePage,
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
    const pageRequest = deferred<{page: FeedPage; indexedAt: string}>()
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

    pageRequest.resolve({
      page: visiblePage,
      indexedAt: '2099-09-01T00:00:00.000Z',
    })
    await act(() => refresh)

    expect(result.current.count).toBe('4')
    expect(result.current.api.getCachedUnreadPage()).toBeUndefined()
  })
})
