import {useQuery} from '@tanstack/react-query'

import {
  type CommunityFeedTarget,
  fetchCommunityFeedTarget,
} from '#/lib/api/community-feed'
import {STALE} from '#/state/queries'
import {useSavedFeeds} from '#/state/queries/feed'
import {useAgent, useSession} from '#/state/session'

export function useCommunityPostTargets() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const {data, isLoading} = useSavedFeeds()
  const feeds = (data?.feeds ?? []).filter(item => item.type === 'feed')
  const feedUris = feeds.map(item => item.view.uri)

  return useQuery<CommunityFeedTarget[]>({
    queryKey: ['community-post-targets', currentAccount?.did ?? '', feedUris],
    enabled: !!currentAccount?.did && !isLoading,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async () => {
      const targets = await Promise.all(
        feeds.map(async item => {
          const target = await fetchCommunityFeedTarget(agent, item.view.uri)
          return target ? {...target, name: item.view.displayName} : null
        }),
      )
      return targets.filter(
        (target): target is CommunityFeedTarget => target !== null,
      )
    },
  })
}
