import {type InfiniteData, type QueryClient} from '@tanstack/react-query'

import {type app} from '#/lexicons'

/**
 * Query key for the curated topic feed (consumed by Topic.tsx).
 * Co-located here so callers like post-shadow can read from the cache
 * without pulling in the screen module.
 */
export const TOPIC_FEED_QUERY_KEY_ROOT = 'topic-feed'

export function* findAllPostsInTopicQueryData(
  queryClient: QueryClient,
  uri: string,
): Generator<app.bsky.feed.defs.PostView, undefined> {
  type PageData = {posts: app.bsky.feed.defs.PostView[]; cursor: string | null}
  const queryDatas = queryClient.getQueriesData<InfiniteData<PageData>>({
    queryKey: [TOPIC_FEED_QUERY_KEY_ROOT],
  })
  for (const [, queryData] of queryDatas) {
    if (!queryData?.pages) continue
    for (const page of queryData.pages) {
      for (const post of page.posts) {
        if (post.uri === uri) {
          yield post
        }
      }
    }
  }
}
