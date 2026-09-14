import {type AppBskyFeedDefs} from '@atproto/api'

/**
 * The private read contract's wire types, mapped back onto the shapes the feed
 * UI already renders.
 *
 * A permissioned-space record URI is not an at-uri, so the appview cannot
 * return one inside `app.bsky.feed.defs#postView`, whose `uri` is declared
 * `format: at-uri`. Its private endpoints therefore answer in
 * `community.blacksky.feed.defs`, which is structurally the same but declares
 * every URI-bearing field a plain string.
 *
 * These are the same objects under different `$type`s, so the mapping is a
 * rename: the alternative is a parallel renderer for private posts, which
 * would drift from the public one. Nothing here parses a URI — the whole point
 * of the custom types is that these URIs must never reach `AtUri`.
 */

const DEFS = 'community.blacksky.feed.defs'

const TYPE_MAP: Record<string, string> = {
  [`${DEFS}#spacePostView`]: 'app.bsky.feed.defs#postView',
  [`${DEFS}#spaceRecordView`]: 'app.bsky.embed.record#view',
  [`${DEFS}#spaceViewRecord`]: 'app.bsky.embed.record#viewRecord',
  [`${DEFS}#spaceViewNotFound`]: 'app.bsky.embed.record#viewNotFound',
  [`${DEFS}#spaceViewBlocked`]: 'app.bsky.embed.record#viewBlocked',
  [`${DEFS}#spaceRecordWithMediaView`]: 'app.bsky.embed.recordWithMedia#view',
  [`${DEFS}#spaceThreadItemPost`]: 'app.bsky.unspecced.defs#threadItemPost',
  [`${DEFS}#spaceThreadItemNotFound`]:
    'app.bsky.unspecced.defs#threadItemNotFound',
  [`${DEFS}#spaceThreadItemBlocked`]:
    'app.bsky.unspecced.defs#threadItemBlocked',
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function rename(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rename)
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] =
      key === '$type' && typeof entry === 'string'
        ? (TYPE_MAP[entry] ?? entry)
        : rename(entry)
  }
  return out
}

/**
 * A single item of a private feed page. Returns undefined when the item is not
 * structurally a feed item, so one malformed row cannot take a page down.
 */
export function toFeedViewPost(
  item: unknown,
): AppBskyFeedDefs.FeedViewPost | undefined {
  if (!isPlainObject(item)) return undefined
  const post = item.post
  if (!isPlainObject(post) || typeof post.uri !== 'string') return undefined
  return rename(item) as AppBskyFeedDefs.FeedViewPost
}

/** A private post view, from `getCommunityPost` or a private feed row. */
export function toPostView(
  post: unknown,
): AppBskyFeedDefs.PostView | undefined {
  if (!isPlainObject(post) || typeof post.uri !== 'string') return undefined
  return rename(post) as AppBskyFeedDefs.PostView
}

export type SpaceFeedPage = {
  cursor?: string
  feed: AppBskyFeedDefs.FeedViewPost[]
}

/** The whole `getSpaceFeed` / community-feed body. */
export function toSpaceFeedPage(body: unknown): SpaceFeedPage {
  const source = isPlainObject(body) ? body : {}
  const feed = Array.isArray(source.feed) ? source.feed : []
  return {
    cursor: typeof source.cursor === 'string' ? source.cursor : undefined,
    feed: feed
      .map(toFeedViewPost)
      .filter((item): item is AppBskyFeedDefs.FeedViewPost => !!item),
  }
}

/** The `thread`/`hasOtherReplies` body of a private thread read. */
export function toSpaceThreadBody(body: unknown): unknown {
  return rename(body)
}
