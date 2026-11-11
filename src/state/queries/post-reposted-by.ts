import {type Client} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {isSpaceRecordUri} from '#/lib/api/space-uri'
import {useAppviewClient} from '#/state/session'
import {app} from '#/lexicons'

const PAGE_SIZE = 30
type RQPageParam = string | undefined

// TODO refactor invalidate on mutate?
const RQKEY_ROOT = 'post-reposted-by'
export const RQKEY = (resolvedUri: string) => [RQKEY_ROOT, resolvedUri]

export async function fetchRepostedByPage(
  client: Client,
  resolvedUri: string,
  cursor?: string,
): Promise<app.bsky.feed.getRepostedBy.$OutputBody> {
  if (isSpaceRecordUri(resolvedUri)) {
    throw new Error('Reposts are not supported for private space posts')
  }
  return await client.call(app.bsky.feed.getRepostedBy, {
    uri: resolvedUri as AtUriString,
    limit: PAGE_SIZE,
    cursor,
  })
}

export function usePostRepostedByQuery(resolvedUri: string | undefined) {
  const client = useAppviewClient()
  return useInfiniteQuery<
    app.bsky.feed.getRepostedBy.$OutputBody,
    Error,
    InfiniteData<app.bsky.feed.getRepostedBy.$OutputBody>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(resolvedUri || ''),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      return fetchRepostedByPage(client, resolvedUri || '', pageParam)
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!resolvedUri && !isSpaceRecordUri(resolvedUri),
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<app.bsky.actor.defs.ProfileView, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<app.bsky.feed.getRepostedBy.$OutputBody>
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
