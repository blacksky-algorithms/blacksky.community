import {type BskyAgent, jsonToLex} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'
import {type SpaceFeedPage, toSpaceFeedPage} from '#/lib/api/space-views'

export const GET_SPACE_FEED = 'community.blacksky.feed.getSpaceFeed'

/**
 * Thrown when a space-backed feed is opened without a session. The message is
 * the `KnownError.FeedSignedInOnly` token so `detectKnownError` renders the
 * sign-in-required state; the alternative — falling through to the public
 * `api.bsky.app` fetch the standard custom-feed path uses when logged out —
 * would ask a public appview for private content and leave the feed spinning.
 */
export const signInRequiredError = () => new Error('FeedSignedInOnly')

/**
 * The private read for a space-backed feed.
 *
 * `feed` is still the ordinary public `app.bsky.feed.generator` at-uri: the
 * generator record remains the feed's identity, so no saved-feed preference
 * needs migrating. Only the query chosen for that URI changes. The record URIs
 * inside the response are space URIs and are never parsed here.
 */
export async function fetchSpaceFeed(
  agent: BskyAgent,
  feed: string,
  {cursor, limit}: {cursor?: string; limit?: number} = {},
): Promise<SpaceFeedPage> {
  const params: Record<string, string> = {feed}
  if (cursor) params.cursor = cursor
  if (limit) params.limit = String(limit)

  const res = await communityXrpc(agent, GET_SPACE_FEED, {params})
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    }
    // Surfaced verbatim so an access refusal stays an access refusal: an empty
    // page here would report "no posts" for "no access".
    throw new Error(body.message || body.error || `HTTP ${res.status}`)
  }
  return toSpaceFeedPage(jsonToLex(await res.json()))
}
