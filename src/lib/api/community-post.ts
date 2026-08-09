import {
  type AppBskyFeedDefs,
  AtUri,
  type BskyAgent,
  jsonToLex,
} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'
import {isSpaceRecordUri} from '#/lib/api/space-uri'

export const GET_COMMUNITY_POST = 'community.blacksky.feed.getCommunityPost'

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

/**
 * Read one community post by URI.
 *
 * The standard `getPosts` cannot serve these: its `uris` are at-uris, and a
 * space record URI is not one. This endpoint takes a plain string, and gates
 * on membership before returning anything.
 */
export async function fetchCommunityPostView(
  agent: BskyAgent,
  uri: string,
): Promise<AppBskyFeedDefs.PostView> {
  const res = await communityXrpc(agent, GET_COMMUNITY_POST, {params: {uri}})
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      error?: string
    }
    throw new Error(body.message || body.error || `HTTP ${res.status}`)
  }
  const data = jsonToLex(await res.json()) as {post?: AppBskyFeedDefs.PostView}
  if (!data.post) throw new Error('Community post not found')
  return data.post
}
