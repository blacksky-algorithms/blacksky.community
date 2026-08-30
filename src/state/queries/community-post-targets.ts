import {useQuery} from '@tanstack/react-query'

import {
  type CommunityFeedTarget,
  fetchCommunityFeedTarget,
} from '#/lib/api/community-feed'
import {STALE} from '#/state/queries'
import {useSavedFeeds} from '#/state/queries/feed'
import {type FeedDescriptor} from '#/state/queries/post-feed'
import {useAgent, useSession} from '#/state/session'

export function useCommunityPostTargets(contextualFeed?: FeedDescriptor) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const {data, isLoading} = useSavedFeeds()
  const feeds = (data?.feeds ?? []).filter(item => item.type === 'feed')
  const candidates = new Map<string, string | undefined>(
    feeds.map(item => [item.view.uri, item.view.displayName] as const),
  )
  if (contextualFeed?.startsWith('feedgen|')) {
    const currentFeedUri = contextualFeed.slice('feedgen|'.length)
    if (!candidates.has(currentFeedUri)) {
      candidates.set(currentFeedUri, undefined)
    }
  }
  const candidateFeeds = [...candidates]

  return useQuery<CommunityFeedTarget[]>({
    queryKey: [
      'community-post-targets',
      currentAccount?.did ?? '',
      candidateFeeds,
    ],
    enabled: !!currentAccount?.did && !isLoading,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async () => {
      const targets = await Promise.all(
        candidateFeeds.map(async ([feed, displayName]) => {
          const target = await fetchCommunityFeedTarget(agent, feed)
          return target ? {...target, name: displayName ?? target.name} : null
        }),
      )
      return targets.filter(
        (target): target is CommunityFeedTarget => target !== null,
      )
    },
  })
}
