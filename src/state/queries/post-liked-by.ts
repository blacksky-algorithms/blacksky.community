import {
  type AppBskyActorDefs,
  type AppBskyFeedGetLikes,
  type BskyAgent,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {getSpacePostLikes} from '#/lib/api/community'
import {isSpaceRecordUri} from '#/lib/api/space-uri'
import {useAgent} from '#/state/session'

const PAGE_SIZE = 30
type RQPageParam = string | undefined

// TODO refactor invalidate on mutate?
const RQKEY_ROOT = 'liked-by'
export const RQKEY = (resolvedUri: string) => [RQKEY_ROOT, resolvedUri]

export async function fetchLikedByPage(
  agent: BskyAgent,
  resolvedUri: string,
  cursor?: string,
): Promise<AppBskyFeedGetLikes.OutputSchema> {
  if (isSpaceRecordUri(resolvedUri)) {
    return getSpacePostLikes(agent, {
      uri: resolvedUri,
      limit: PAGE_SIZE,
      cursor,
    })
  }
  const res = await agent.getLikes({
    uri: resolvedUri,
    limit: PAGE_SIZE,
    cursor,
  })
  return res.data
}

export function useLikedByQuery(resolvedUri: string | undefined) {
  const agent = useAgent()
  return useInfiniteQuery<
    AppBskyFeedGetLikes.OutputSchema,
    Error,
    InfiniteData<AppBskyFeedGetLikes.OutputSchema>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(resolvedUri || ''),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      return fetchLikedByPage(agent, resolvedUri || '', pageParam)
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!resolvedUri,
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<AppBskyActorDefs.ProfileView, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<AppBskyFeedGetLikes.OutputSchema>
  >({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const like of page.likes) {
        if (like.actor.did === did) {
          yield like.actor
        }
      }
    }
  }
}
