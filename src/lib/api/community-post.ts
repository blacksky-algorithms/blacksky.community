import {
  type AppBskyFeedDefs,
  AppBskyFeedPost,
  type BskyAgent,
  jsonToLex,
} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'
import {isSpaceRecordUri, parseSpaceUri} from '#/lib/api/space-uri'
import {toPostView} from '#/lib/api/space-views'
import * as bsky from '#/types/bsky'

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

/**
 * Space records use the same post record shape as public posts, but their
 * reply and quote refs are permissioned-space URIs rather than AT-URIs. The
 * public lexicon validator therefore cannot validate those otherwise valid
 * records. Space responses are already validated by the AppView endpoint;
 * retain the fields the renderer requires here while keeping strict lexicon
 * validation for public posts.
 */
export function isRenderablePostRecord(
  post: AppBskyFeedDefs.PostView,
): post is AppBskyFeedDefs.PostView & {record: AppBskyFeedPost.Record} {
  if (!AppBskyFeedPost.isRecord(post.record)) return false
  if (!isSpaceRecordUri(post.uri)) {
    return bsky.validate(post.record, AppBskyFeedPost.validateRecord)
  }
  return (
    typeof post.record.text === 'string' &&
    typeof post.record.createdAt === 'string'
  )
}

export type CommunityPostView = AppBskyFeedDefs.PostView & {
  communitySpace?: string
}

/**
 * The permissioned space a post lives in, which is its authorization
 * boundary. A feed is only a view over a space, so the post view carries the
 * space; never fed to `AtUri`, which misparses a space URI.
 */
export function getCommunitySpaceUri(
  post: AppBskyFeedDefs.PostView | undefined,
): string | undefined {
  const space = (post as unknown as {communitySpace?: unknown} | undefined)
    ?.communitySpace
  // The 4-segment pointer only: a record inside a space is not the space.
  return typeof space === 'string' && parseSpaceUri(space) !== null
    ? space
    : undefined
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
  const data = jsonToLex(await res.json()) as {post?: unknown}
  const post = toPostView(data.post)
  if (!post) throw new Error('Community post not found')
  return post
}
