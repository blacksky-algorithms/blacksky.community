import {type BskyAgent} from '@atproto/api'

import {parseSpaceRecordUri, spaceUriOf} from '#/lib/api/space-uri'

/**
 * Writes into a permissioned space.
 *
 * A space record goes to the account's **own PDS**, which routes
 * `com.atproto.space.*` to the space host. That means **no `atproto-proxy`
 * header**: proxying would send the write to the appview, which is not where
 * this content lives. It also means the request is DPoP-signed by the agent
 * exactly like any other PDS write — the space host verifies that token
 * itself.
 *
 * Records are sent as raw JSON rather than through typed builders. A like or a
 * reply inside a space refers to other space records, whose URIs are not valid
 * at-uris, so SDK-side lexicon validation would reject them; the receiving
 * host stores records shape-agnostically and the syncers validate instead.
 */

export const SPACE_CREATE_RECORD = 'com.atproto.space.createRecord'
export const SPACE_DELETE_RECORD = 'com.atproto.space.deleteRecord'

export const POST_COLLECTION = 'app.bsky.feed.post'
export const LIKE_COLLECTION = 'app.bsky.feed.like'

export type SpaceWriteResult = {
  uri: string
  cid: string
}

/** Raised when the PDS does not serve the space methods at all. */
export class SpaceUnsupportedError extends Error {
  constructor() {
    super('This account’s server does not support private feeds yet')
    this.name = 'SpaceUnsupportedError'
  }
}

async function spaceXrpc(
  agent: BskyAgent,
  method: string,
  body: unknown,
): Promise<Response> {
  return agent.fetchHandler(`/xrpc/${method}`, {
    method: 'POST',
    // Deliberately no `atproto-proxy`: this write belongs to the account's own
    // PDS, not the appview.
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
}

async function failure(response: Response): Promise<never> {
  // A PDS that has never heard of the space methods answers 404 rather than an
  // XRPC error, which is how a foreign-PDS account is recognised.
  if (response.status === 404) {
    throw new SpaceUnsupportedError()
  }
  const body = (await response.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  throw new Error(body.message || body.error || `HTTP ${response.status}`)
}

/** Create a record in the caller's permissioned repo within `space`. */
export async function spaceCreateRecord(
  agent: BskyAgent,
  space: string,
  collection: string,
  record: Record<string, unknown>,
  rkey?: string,
  idempotencyKey?: string,
): Promise<SpaceWriteResult> {
  const response = await spaceXrpc(agent, SPACE_CREATE_RECORD, {
    space,
    collection,
    record,
    ...(rkey ? {rkey} : {}),
    ...(idempotencyKey ? {idempotencyKey} : {}),
  })
  if (!response.ok) return failure(response)
  const data = (await response.json()) as Partial<SpaceWriteResult>
  if (!data.uri || !data.cid) {
    throw new Error('Space host returned no record reference')
  }
  return {uri: data.uri, cid: data.cid}
}

/** Delete one of the caller's own records from `space`. */
export async function spaceDeleteRecord(
  agent: BskyAgent,
  space: string,
  collection: string,
  rkey: string,
): Promise<void> {
  const response = await spaceXrpc(agent, SPACE_DELETE_RECORD, {
    space,
    collection,
    rkey,
  })
  if (!response.ok) return failure(response)
}

/**
 * Like a post inside a space.
 *
 * The like is written into the **permissioned repo**, never the public one: a
 * public like whose subject is a space URI would announce that the private
 * post exists, and to whom.
 */
export async function spaceLike(
  agent: BskyAgent,
  space: string,
  subject: {uri: string; cid: string},
): Promise<SpaceWriteResult> {
  return spaceCreateRecord(agent, space, LIKE_COLLECTION, {
    $type: LIKE_COLLECTION,
    subject: {uri: subject.uri, cid: subject.cid},
    createdAt: new Date().toISOString(),
  })
}

/** Remove a like previously written into `space`. */
export async function spaceUnlike(
  agent: BskyAgent,
  space: string,
  likeUri: string,
): Promise<void> {
  const rkey = likeUri.split('/').pop()
  if (!rkey) throw new Error(`Unusable like uri: ${likeUri}`)
  return spaceDeleteRecord(agent, space, LIKE_COLLECTION, rkey)
}

/*
 * The three interactions below answer `null` for anything that is not a space
 * record, so a caller reads as `spaceX(...) ?? publicX(...)`. The routing lives
 * here rather than in the mutation hooks so it can be tested without them.
 */

/** Like `uri` in its own space, or null if it is not a space record. */
export function spaceLikeIfSpace(
  agent: BskyAgent,
  uri: string,
  cid: string,
): Promise<SpaceWriteResult> | null {
  const ref = parseSpaceRecordUri(uri)
  return ref ? spaceLike(agent, spaceUriOf(ref), {uri, cid}) : null
}

/** Undo a like held in a space, or null if `likeUri` is not a space record. */
export function spaceUnlikeIfSpace(
  agent: BskyAgent,
  likeUri: string,
): Promise<void> | null {
  const ref = parseSpaceRecordUri(likeUri)
  return ref ? spaceUnlike(agent, spaceUriOf(ref), likeUri) : null
}

/** Delete one's own space record, or null if `uri` is not one. */
export function spaceDeleteIfSpace(
  agent: BskyAgent,
  uri: string,
): Promise<void> | null {
  const ref = parseSpaceRecordUri(uri)
  return ref
    ? spaceDeleteRecord(agent, spaceUriOf(ref), ref.collection, ref.rkey)
    : null
}
