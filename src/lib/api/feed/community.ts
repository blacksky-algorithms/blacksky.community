import {type AppBskyFeedDefs, type AtpAgent, jsonToLex} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'
import {type FeedAPI, type FeedAPIResponse} from './types'

export class CommunityFeedAPI implements FeedAPI {
  constructor(private agent: AtpAgent) {}

  async peekLatest(): Promise<AppBskyFeedDefs.FeedViewPost> {
    const page = await this.fetch({cursor: undefined, limit: 1})
    return page.feed[0]
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    const params: Record<string, string> = {limit: String(limit)}
    if (cursor) params.cursor = cursor
    const res = await communityXrpc(
      this.agent,
      'community.blacksky.feed.getCommunityTimeline',
      {params},
    )
    if (!res.ok) throw new Error(`getCommunityTimeline failed: ${res.status}`)
    const page = jsonToLex(await res.json()) as FeedAPIResponse
    return {cursor: page.cursor, feed: page.feed ?? []}
  }
}
