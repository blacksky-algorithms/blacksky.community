import {useMemo} from 'react'
import {type AppBskyFeedDefs, moderatePost, type ModerationOpts} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {aggregateUserInterests} from '#/lib/api/feed/utils'
import {FeedTuner, type FeedTunerFn} from '#/lib/api/feed-manip'
import {useFeedTuners} from '#/state/preferences/feed-tuners'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {useAgent} from '#/state/session'
import {createApi, type FeedDescriptor} from './post-feed'

export const FEED_PEEK_RQKEY = (feed: FeedDescriptor) => ['feed-peek', feed]

export function selectPeekPosts({
  feed,
  feedTuners,
  moderationOpts,
}: {
  feed: AppBskyFeedDefs.FeedViewPost[]
  feedTuners: FeedTunerFn[]
  moderationOpts: ModerationOpts
}) {
  return new FeedTuner(feedTuners)
    .tune(feed)
    .flatMap(slice => slice.items)
    .filter(item => !moderatePost(item.post, moderationOpts).ui('contentList').filter)
    .slice(0, 2)
    .map(item => item.post)
}

export function useFeedPeekQuery(feedDesc: FeedDescriptor, enabled = true) {
  const agent = useAgent()
  const feedTuners = useFeedTuners(feedDesc)
  const moderationOpts = useModerationOpts()
  const {data: preferences} = usePreferencesQuery()
  const input = useMemo(
    () => ({agent, feedTuners, moderationOpts, preferences}),
    [agent, feedTuners, moderationOpts, preferences],
  )

  return useQuery({
    queryKey: FEED_PEEK_RQKEY(feedDesc),
    enabled: enabled && Boolean(input.moderationOpts) && Boolean(input.preferences),
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const followingPinnedIndex =
        input.preferences?.savedFeeds.findIndex(
          item => item.pinned && item.value === 'following',
        ) ?? -1
      const api = createApi({
        feedDesc,
        feedParams: {},
        feedTuners: input.feedTuners,
        userInterests: aggregateUserInterests(input.preferences),
        agent: input.agent,
        enableFollowingToDiscoverFallback: followingPinnedIndex === 0,
      })
      const page = await api.fetch({cursor: undefined, limit: 10})
      return selectPeekPosts({
        feed: page.feed,
        feedTuners: input.feedTuners,
        moderationOpts: input.moderationOpts!,
      })
    },
  })
}
