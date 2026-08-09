import {type AppBskyFeedDefs, AtUri} from '@atproto/api'

import {isSpaceRecordUri} from '#/lib/api/space-uri'

const COMMUNITY_POST_COLLECTION = 'community.blacksky.feed.post'

/**
 * Whether this post is community content — the appview-stored stub, or a
 * record living in a permissioned space. Keyed structurally rather than by
 * collection, so a new kind of space record is covered the day it appears.
 */
export function isCommunityPostUri(uri: string | undefined): boolean {
  return (
    !!uri && (uri.includes(COMMUNITY_POST_COLLECTION) || isSpaceRecordUri(uri))
  )
}

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
