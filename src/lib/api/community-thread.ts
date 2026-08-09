import {type BskyAgent} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'

export const GET_COMMUNITY_THREAD = 'community.blacksky.feed.getCommunityThread'

export type CommunityThreadResponse = {
  thread: unknown[]
  hasOtherReplies: boolean
  /** Space feeds carry no threadgates (they are deferred), so never set. */
  threadgate?: undefined
}

/**
 * Fetch a thread anchored on a permissioned-space record.
 *
 * The standard thread endpoint cannot be used: its anchor is declared
 * `format: at-uri`, and a space URI is not one, so the request is refused
 * before it reaches a handler. This endpoint takes the anchor as a plain
 * string and answers with the same item shape.
 */
export async function fetchCommunityThread(
  agent: BskyAgent,
  params: {
    anchor: string
    above?: boolean
    below?: number
    branchingFactor?: number
  },
): Promise<CommunityThreadResponse> {
  const query: Record<string, string> = {anchor: params.anchor}
  if (params.above !== undefined) query.above = String(params.above)
  if (params.below !== undefined) query.below = String(params.below)
  if (params.branchingFactor !== undefined) {
    query.branchingFactor = String(params.branchingFactor)
  }
  const res = await communityXrpc(agent, GET_COMMUNITY_THREAD, {params: query})
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      error?: string
    }
    throw new Error(body.message || body.error || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as Partial<CommunityThreadResponse>
  return {
    thread: data.thread ?? [],
    hasOtherReplies: !!data.hasOtherReplies,
  }
}
