import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'

const mockFetchCommunityFeedTarget = jest.fn()
const mockUseSavedFeeds = jest.fn()
const mockAgent = {}

jest.mock('#/lib/api/community-feed', () => ({
  fetchCommunityFeedTarget: (...args: unknown[]) =>
    mockFetchCommunityFeedTarget(...args),
}))
jest.mock('#/state/queries/feed', () => ({
  useSavedFeeds: () => mockUseSavedFeeds(),
}))
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
  useSession: () => ({currentAccount: {did: 'did:plc:test'}}),
}))

import {useCommunityPostTargets} from '../community-post-targets'

const FEED_URI = 'at://did:plc:test/app.bsky.feed.generator/private'
const FEED_DESCRIPTOR = `feedgen|${FEED_URI}` as const
const TARGET = {
  feed: FEED_URI,
  name: 'Generator fallback',
  serviceDid: 'did:web:feeds.test',
  config: {
    $type: 'community.blacksky.feed.config',
    contentType: 'communityRecord',
    visibility: 'gated',
    space: 'at://did:plc:test/community.blacksky.space/private',
    group: 'members',
    createdAt: '2026-08-30T00:00:00.000Z',
  },
}

function wrapper({children}: React.PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCommunityPostTargets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSavedFeeds.mockReturnValue({data: {feeds: []}, isLoading: false})
    mockFetchCommunityFeedTarget.mockResolvedValue(TARGET)
  })

  it('authoritatively resolves an unsaved writable contextual feed', async () => {
    const {result} = renderHook(
      () => useCommunityPostTargets(FEED_DESCRIPTOR),
      {wrapper},
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetchCommunityFeedTarget).toHaveBeenCalledTimes(1)
    expect(mockFetchCommunityFeedTarget).toHaveBeenCalledWith(
      mockAgent,
      FEED_URI,
    )
    expect(result.current.data).toEqual([TARGET])
  })

  it('deduplicates the current feed against saved targets and keeps its saved display name', async () => {
    mockUseSavedFeeds.mockReturnValue({
      data: {
        feeds: [
          {
            type: 'feed',
            view: {uri: FEED_URI, displayName: 'Saved display name'},
          },
        ],
      },
      isLoading: false,
    })
    const {result} = renderHook(
      () => useCommunityPostTargets(FEED_DESCRIPTOR),
      {wrapper},
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetchCommunityFeedTarget).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual([
      {...TARGET, name: 'Saved display name'},
    ])
  })
})
