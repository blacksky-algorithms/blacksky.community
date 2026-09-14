import {useMemo} from 'react'
import {
  AppBskyFeedDefs,
  type AppBskyFeedPost,
  AtUri,
  type BskyAgent,
  jsonToLex,
  moderatePost,
  type ModerationDecision,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'

import {communityXrpc} from '#/lib/api/community'
import {FeedTuner} from '#/lib/api/feed-manip'
import {spaceRecordAuthor} from '#/lib/api/space-uri'
import {toPostView, toSpaceFeedPage} from '#/lib/api/space-views'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {STALE} from '#/state/queries'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {
  embedViewRecordToPostView,
  getEmbeddedPost,
  makeUriMatcher,
} from '#/state/queries/util'
import {useAgent} from '#/state/session'

const PAGE_SIZE = 30
type RQPageParam = string | undefined

export const RQKEY_ROOT = 'community-feed'
export const RQKEY = (actor: string) => [RQKEY_ROOT, actor]

const TIMELINE_RQKEY_ROOT = 'community-timeline'
export const TIMELINE_RQKEY = () => [TIMELINE_RQKEY_ROOT]

// Server returns feedViewPost format with hydrated posts
// Support both old 'posts' format (raw) and new 'feed' format (hydrated)
interface CommunityFeedPage {
  cursor?: string
  feed?: AppBskyFeedDefs.FeedViewPost[]
  // Legacy format for backward compatibility during deployment
  posts?: Array<{
    uri: string
    cid?: string
    creator: string
    text: string
    createdAt: string
    indexedAt: string
  }>
}

export function useCommunityFeedQuery(actor: string | undefined) {
  const agent = useAgent()
  return useInfiniteQuery<
    CommunityFeedPage,
    Error,
    InfiniteData<CommunityFeedPage>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(actor || ''),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      const params: Record<string, string> = {
        actor: actor || '',
        limit: String(PAGE_SIZE),
      }
      if (pageParam) {
        params.cursor = pageParam
      }
      const res = await communityXrpc(
        agent,
        'community.blacksky.feed.getCommunityFeed',
        {params},
      )
      if (!res.ok) {
        throw new Error(`getCommunityFeed failed: ${res.status}`)
      }
      return toSpaceFeedPage(jsonToLex(await res.json()))
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!actor,
  })
}

/**
 * Query for the global community timeline (all community posts).
 * Used on the Home screen Community tab.
 */
export function useCommunityTimelineQuery(enabled: boolean) {
  const agent = useAgent()
  return useInfiniteQuery<
    CommunityFeedPage,
    Error,
    InfiniteData<CommunityFeedPage>,
    QueryKey,
    RQPageParam
  >({
    queryKey: TIMELINE_RQKEY(),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
      }
      if (pageParam) {
        params.cursor = pageParam
      }
      const res = await communityXrpc(
        agent,
        'community.blacksky.feed.getCommunityTimeline',
        {params},
      )
      if (!res.ok) {
        throw new Error(`getCommunityTimeline failed: ${res.status}`)
      }
      return toSpaceFeedPage(jsonToLex(await res.json()))
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    // Never auto-refetch when `enabled` flips back on: replaying every
    // loaded page shifts content under the viewport (same reason the
    // page polls a head probe instead of refetching on a timer).
    staleTime: STALE.INFINITY,
    enabled,
  })
}

/**
 * Fetch the newest surfacing community timeline post, for cheap freshness
 * probes. Probes a small window rather than a single item because the raw
 * head is often a non-surfacing reply that would hide newer posts behind it.
 */
export async function fetchCommunityTimelineHead(
  agent: BskyAgent,
): Promise<AppBskyFeedDefs.FeedViewPost | undefined> {
  const res = await communityXrpc(
    agent,
    'community.blacksky.feed.getCommunityTimeline',
    {params: {limit: '10'}},
  )
  if (!res.ok) {
    throw new Error(`getCommunityTimeline failed: ${res.status}`)
  }
  const page = toSpaceFeedPage(jsonToLex(await res.json()))
  return page.feed.find(surfacesInCommunityFeed)
}

// A reply only resurfaces its thread when the root author is
// continuing their own thread; other people's replies stay in the
// thread view. Stands in for followedRepliesOnly, which would pass
// everything here since the whole community is "followed".
export function surfacesInCommunityFeed(
  item: AppBskyFeedDefs.FeedViewPost,
): boolean {
  // Blocked/muted authors never surface, same as the Following feed.
  const authorViewer = item.post.author.viewer
  if (
    authorViewer?.blocking ||
    authorViewer?.blockedBy ||
    authorViewer?.muted
  ) {
    return false
  }
  const reply = (item.post.record as AppBskyFeedPost.Record)?.reply
  if (!reply?.root?.uri) return true
  // Replies whose parent the appview didn't hydrate are orphans; the
  // tuner drops them (removeOrphans), so they must not count as new.
  if (!item.reason && !AppBskyFeedDefs.isPostView(item.reply?.parent)) {
    return false
  }
  // A space record URI names its author in its own segment; `AtUri` would
  // report the space authority as the host and never match.
  const rootAuthor =
    spaceRecordAuthor(reply.root.uri) ?? new AtUri(reply.root.uri).host
  return rootAuthor === item.post.author.did
}

const COMMUNITY_POST_RQKEY_ROOT = 'community-post'
export const COMMUNITY_POST_RQKEY = (uri: string) => [
  COMMUNITY_POST_RQKEY_ROOT,
  uri,
]

export function useCommunityPostQuery(uri: string | undefined) {
  const agent = useAgent()
  return useQuery<AppBskyFeedDefs.PostView>({
    queryKey: COMMUNITY_POST_RQKEY(uri || ''),
    async queryFn() {
      const res = await communityXrpc(
        agent,
        'community.blacksky.feed.getCommunityPost',
        {params: {uri: uri || ''}},
      )
      if (!res.ok) {
        throw new Error(`getCommunityPost failed: ${res.status}`)
      }
      const data = jsonToLex(await res.json()) as {post?: unknown}
      const post = toPostView(data.post)
      if (!post) throw new Error('Community post not found')
      return post
    },
    enabled: !!uri,
  })
}

export interface HydratedCommunityPost {
  post: AppBskyFeedDefs.PostView
  record: AppBskyFeedPost.Record
  moderation: ModerationDecision
}

export interface CommunityFeedSliceItem extends HydratedCommunityPost {
  _reactKey: string
  uri: string
  parentAuthor?: AppBskyFeedDefs.PostView['author']
}

export interface CommunityFeedSlice {
  _reactKey: string
  items: CommunityFeedSliceItem[]
  isIncompleteThread: boolean
}

/**
 * Takes pre-hydrated feed items from the server and adds moderation decisions.
 * The server now returns properly hydrated PostViews with author info and counts.
 */
export function useCommunityFeedHydrated(
  feedItems: AppBskyFeedDefs.FeedViewPost[],
): HydratedCommunityPost[] {
  const moderationOpts = useModerationOpts()

  return useMemo(() => {
    if (!moderationOpts) return []

    return feedItems
      .filter(item => item?.post) // Filter out any undefined items
      .map(item => {
        const postView = item.post
        const record = postView.record as AppBskyFeedPost.Record
        const moderation = moderatePost(postView, moderationOpts)
        return {post: postView, record, moderation}
      })
  }, [feedItems, moderationOpts])
}

// Group feed items into slices so a self-reply (parent + reply by same author)
// renders as one visually-connected card instead of two flat ones.
export function useCommunityFeedSlices(
  feedItems: AppBskyFeedDefs.FeedViewPost[],
): CommunityFeedSlice[] {
  const moderationOpts = useModerationOpts()
  const {data: preferences} = usePreferencesQuery()

  return useMemo(() => {
    if (!moderationOpts) return []
    const surfaced = feedItems.filter(surfacesInCommunityFeed)
    // Same tuner stack as the Following feed (see useFeedTuners).
    const tunerFns = [FeedTuner.removeOrphans]
    if (preferences?.feedViewPrefs.hideReposts) {
      tunerFns.push(FeedTuner.removeReposts)
    }
    if (preferences?.feedViewPrefs.hideReplies) {
      tunerFns.push(FeedTuner.removeReplies)
    }
    if (preferences?.feedViewPrefs.hideQuotePosts) {
      tunerFns.push(FeedTuner.removeQuotePosts)
    }
    tunerFns.push(FeedTuner.dedupThreads)
    tunerFns.push(FeedTuner.removeMutedThreads)
    const tuner = new FeedTuner(tunerFns)
    const raw = tuner.tune(surfaced)

    return raw
      .map((slice, sliceIdx) => {
        const items: CommunityFeedSliceItem[] = slice.items.map((item, i) => {
          const record = item.post.record as AppBskyFeedPost.Record
          return {
            _reactKey: `${slice._reactKey}-${i}-${item.post.uri}`,
            uri: item.post.uri,
            post: item.post,
            record,
            moderation: moderatePost(item.post, moderationOpts),
            parentAuthor: item.parentAuthor,
          }
        })
        return {
          _reactKey: slice._reactKey || `slice-${sliceIdx}`,
          items,
          isIncompleteThread: slice.isIncompleteThread,
        }
      })
      .filter(slice => {
        // Nuclear block: drop the whole thread if any author in it is
        // blocked or blocking the viewer, matching the standard app.
        const hasBlock = slice.items.some(item => {
          const v = item.post.author.viewer
          return !!(v?.blocking || v?.blockedBy)
        })
        if (hasBlock) return false
        // Drop items the moderation engine filters from list contexts
        // (hidden-for-me posts, muted authors, etc.).
        slice.items = slice.items.filter(
          item => !item.moderation.ui('contentList').filter,
        )
        return slice.items.length > 0
      })
  }, [
    feedItems,
    moderationOpts,
    preferences?.feedViewPrefs.hideQuotePosts,
    preferences?.feedViewPrefs.hideReplies,
    preferences?.feedViewPrefs.hideReposts,
  ])
}

/**
 * Generator function to find all posts in the community feed cache.
 * Used by the post shadow system to update cached posts after mutations.
 */
export function* findAllPostsInQueryData(
  queryClient: QueryClient,
  uri: string,
): Generator<AppBskyFeedDefs.PostView, void> {
  const matches = makeUriMatcher(uri)

  // Search both actor feeds and timeline
  const queryDatas = [
    ...queryClient.getQueriesData<InfiniteData<CommunityFeedPage>>({
      queryKey: [RQKEY_ROOT],
    }),
    ...queryClient.getQueriesData<InfiniteData<CommunityFeedPage>>({
      queryKey: [TIMELINE_RQKEY_ROOT],
    }),
  ]

  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData.pages) {
      if (!page.feed) {
        continue
      }
      for (const item of page.feed) {
        if (!item?.post) {
          continue
        }
        if (matches(item.post)) {
          yield item.post
        }

        // Check for quoted posts in embeds
        const quotedPost = getEmbeddedPost(item.post.embed)
        if (quotedPost && matches(quotedPost)) {
          yield embedViewRecordToPostView(quotedPost)
        }

        // Reply-context rows render in slices too; without these, likes on
        // a parent/root row never reach the shadow cache.
        if (AppBskyFeedDefs.isPostView(item.reply?.parent)) {
          if (matches(item.reply.parent)) {
            yield item.reply.parent
          }
        }
        if (AppBskyFeedDefs.isPostView(item.reply?.root)) {
          if (matches(item.reply.root)) {
            yield item.reply.root
          }
        }
      }
    }
  }
}
