import {type Client, jsonToLex} from '@atproto/lex'
import {AtUri} from '@atproto/syntax'

import {communityXrpc} from '#/lib/api/community'
import {isSpaceRecordUri, parseSpaceUri} from '#/lib/api/space-uri'
import {toPostView} from '#/lib/api/space-views'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

export const GET_COMMUNITY_POST = 'community.blacksky.feed.getCommunityPost'

export const COMMUNITY_POST_COLLECTION = 'community.blacksky.feed.post'
const PEER_MOD_LABELABLE_COLLECTIONS = [
  'app.bsky.feed.post',
  COMMUNITY_POST_COLLECTION,
]

export function isPeerModLabelableUri(uri: string): boolean {
  return PEER_MOD_LABELABLE_COLLECTIONS.includes(new AtUri(uri).collection)
}

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
 * retain the fields the renderer requires here while keeping lexicon
 * validation for public posts.
 */
export function isRenderablePostRecord(
  post: app.bsky.feed.defs.PostView,
): post is app.bsky.feed.defs.PostView & {record: app.bsky.feed.post.Main} {
  if (!bsky.isType(app.bsky.feed.post, post.record)) return false
  if (!isSpaceRecordUri(post.uri)) {
    // Lenient so a record that still holds a legacy blob reference renders.
    return bsky.matches(app.bsky.feed.post, post.record, {strict: false})
  }
  return (
    typeof post.record.text === 'string' &&
    typeof post.record.createdAt === 'string'
  )
}

export type CommunityPostView = app.bsky.feed.defs.PostView & {
  communitySpace?: string
}

/**
 * The permissioned space a post lives in, which is its authorization
 * boundary. A feed is only a view over a space, so the post view carries the
 * space; never fed to `AtUri`, which misparses a space URI.
 */
export function getCommunitySpaceUri(
  post: app.bsky.feed.defs.PostView | undefined,
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
  client: Client,
  uri: string,
): Promise<app.bsky.feed.defs.PostView> {
  const res = await communityXrpc(client, GET_COMMUNITY_POST, {params: {uri}})
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
