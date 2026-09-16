import {useQuery} from '@tanstack/react-query'

import {
  type CommunityFeedPermission,
  fetchFeedPermissions,
} from '#/lib/api/community-feed'
import {useAgent, useSession} from '#/state/session'

export const feedPermissionsQueryKey = (
  did: string | undefined,
  feed: string,
) => ['community-feed-permissions', did ?? '', feed]

export function useFeedPermissionsQuery(feed: string) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery<CommunityFeedPermission[]>({
    queryKey: feedPermissionsQueryKey(currentAccount?.did, feed),
    enabled: !!currentAccount?.did && !!feed,
    staleTime: 60 * 1000,
    queryFn: () => fetchFeedPermissions(agent, feed),
  })
}
