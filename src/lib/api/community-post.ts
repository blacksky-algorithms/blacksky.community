import {type AppBskyFeedDefs, AtUri} from '@atproto/api'

export type CommunityPostView = AppBskyFeedDefs.PostView & {
  communityFeed?: string
}

export function getCommunityFeedUri(
  post: AppBskyFeedDefs.PostView | undefined,
): string | undefined {
  const feed = (post as unknown as {communityFeed?: unknown} | undefined)
    ?.communityFeed
  if (typeof feed !== 'string') return undefined
  try {
    const uri = new AtUri(feed)
    return uri.collection === 'app.bsky.feed.generator' && uri.rkey
      ? feed
      : undefined
  } catch {
    return undefined
  }
}
