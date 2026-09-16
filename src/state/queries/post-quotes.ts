import {
  type AppBskyActorDefs,
  AppBskyEmbedRecord,
  type AppBskyFeedDefs,
  type AppBskyFeedGetQuotes,
  type BskyAgent,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {getSpacePostQuotes} from '#/lib/api/community'
import {isSpaceRecordUri} from '#/lib/api/space-uri'
import {useAgent} from '#/state/session'
import {
  embedViewRecordToPostView,
  getEmbeddedPost,
  makeUriMatcher,
} from './util'

const PAGE_SIZE = 30
type RQPageParam = string | undefined

const RQKEY_ROOT = 'post-quotes'
export const RQKEY = (resolvedUri: string) => [RQKEY_ROOT, resolvedUri]

export async function fetchPostQuotesPage(
  agent: BskyAgent,
  resolvedUri: string,
  cursor?: string,
): Promise<AppBskyFeedGetQuotes.OutputSchema> {
  if (isSpaceRecordUri(resolvedUri)) {
    return getSpacePostQuotes(agent, {
      uri: resolvedUri,
      limit: PAGE_SIZE,
      cursor,
    })
  }
  const res = await agent.api.app.bsky.feed.getQuotes({
    uri: resolvedUri,
    limit: PAGE_SIZE,
    cursor,
  })
  return res.data
}

export function usePostQuotesQuery(resolvedUri: string | undefined) {
  const agent = useAgent()
  return useInfiniteQuery<
    AppBskyFeedGetQuotes.OutputSchema,
    Error,
    InfiniteData<AppBskyFeedGetQuotes.OutputSchema>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(resolvedUri || ''),
    async queryFn({pageParam}: {pageParam: RQPageParam}) {
      return fetchPostQuotesPage(agent, resolvedUri || '', pageParam)
    },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!resolvedUri,
    select: data => {
      return {
        ...data,
        pages: data.pages.map(page => {
          return {
            ...page,
            posts: page.posts.filter(post => {
              if (post.embed && AppBskyEmbedRecord.isView(post.embed)) {
                if (AppBskyEmbedRecord.isViewDetached(post.embed.record)) {
                  return false
                }
              }
              return true
            }),
          }
        }),
      }
    },
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<AppBskyActorDefs.ProfileViewBasic, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<AppBskyFeedGetQuotes.OutputSchema>
  >({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const item of page.posts) {
        if (item.author.did === did) {
          yield item.author
        }
        const quotedPost = getEmbeddedPost(item.embed)
        if (quotedPost?.author.did === did) {
          yield quotedPost.author
        }
      }
    }
  }
}

export function* findAllPostsInQueryData(
  queryClient: QueryClient,
  uri: string,
): Generator<AppBskyFeedDefs.PostView, undefined> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<AppBskyFeedGetQuotes.OutputSchema>
  >({
    queryKey: [RQKEY_ROOT],
  })
  const matches = makeUriMatcher(uri)
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const post of page.posts) {
        if (matches(post)) {
          yield post
        }

        const quotedPost = getEmbeddedPost(post.embed)
        if (quotedPost && matches(quotedPost)) {
          yield embedViewRecordToPostView(quotedPost)
        }
      }
    }
  }
}
