import {
  type AppBskyActorDefs,
  type AppBskyFeedGetRepostedBy,
  type BskyAgent,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {isSpaceRecordUri} from '#/lib/api/space-uri'
import {useAgent} from '#/state/session'

const PAGE_SIZE = 30
type RQPageParam = string | undefined

// TODO refactor invalidate on mutate?
const RQKEY_ROOT = 'post-reposted-by'
export const RQKEY = (resolvedUri: string) => [RQKEY_ROOT, resolvedUri]

export async function fetchRepostedByPage(
  agent: BskyAgent,
  resolvedUri: string,
  cursor?: string,
): Promise<AppBskyFeedGetRepostedBy.OutputSchema> {
  if (isSpaceRecordUri(resolvedUri)) {
    throw new Error('Reposts are not supported for private space posts')
  }
  const res = await agent.getRepostedBy({
    uri: resolvedUri,
    limit: PAGE_SIZE,
    cursor,
  })
  return res.data
}

export function usePostRepostedByQuery(resolvedUri: string | undefined) {
  const agent = useAgent()
  return useInfiniteQuery<
    AppBskyFeedGetRepostedBy.OutputSchema,
    Error,
    InfiniteData<AppBskyFeedGetRepostedBy.OutputSchema>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(resolvedUri || ''),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      return fetchRepostedByPage(agent, resolvedUri || '', pageParam)
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!resolvedUri && !isSpaceRecordUri(resolvedUri),
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<AppBskyActorDefs.ProfileView, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<AppBskyFeedGetRepostedBy.OutputSchema>
  >({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const repostedBy of page.repostedBy) {
        if (repostedBy.did === did) {
          yield repostedBy
        }
      }
    }
  }
}
