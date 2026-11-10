import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {useAppviewClient} from '#/state/session'
import {app} from '#/lexicons'

const RQKEY_ROOT = 'my-muted-accounts'
export const RQKEY = () => [RQKEY_ROOT]
type RQPageParam = string | undefined

export function useMyMutedAccountsQuery() {
  const client = useAppviewClient()
  return useInfiniteQuery<
    app.bsky.graph.getMutes.$OutputBody,
    Error,
    InfiniteData<app.bsky.graph.getMutes.$OutputBody>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      return await client.call(app.bsky.graph.getMutes, {
        limit: 30,
        cursor: pageParam,
      })
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<app.bsky.actor.defs.ProfileView, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<app.bsky.graph.getMutes.$OutputBody>
  >({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const mute of page.mutes) {
        if (mute.did === did) {
          yield mute
        }
      }
    }
  }
}

/**
 * Check if a DID is muted by the current user
 * Used by fallback mechanism to maintain mute preferences
 */
export function isDidMuted(
  queryClient: QueryClient,
  did: string,
): {muted: boolean} {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<AppBskyGraphGetMutes.OutputSchema>
  >({
    queryKey: [RQKEY_ROOT],
  })

  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const mute of page.mutes) {
        if (mute.did === did) {
          return {muted: true}
        }
      }
    }
  }

  return {muted: false}
}
