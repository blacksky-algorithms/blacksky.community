import {
  type AppBskyFeedGetLikes,
  type AppBskyFeedGetQuotes,
  type BskyAgent,
  jsonToLex,
} from '@atproto/api'

import {HOME_PROXY_HEADER} from '#/lib/constants'
import {toPostView} from './space-views'

export type CommunityXrpcParam = string | number | boolean

export async function communityXrpc(
  agent: BskyAgent,
  method: string,
  opts?: {
    params?: Record<
      string,
      CommunityXrpcParam | readonly CommunityXrpcParam[] | undefined
    >
    body?: unknown
    serviceDid?: string
  },
): Promise<Response> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(opts?.params ?? {})) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (item !== undefined) {
        searchParams.append(key, String(item))
      }
    }
  }
  const encodedParams = searchParams.toString()
  const qs = encodedParams ? `?${encodedParams}` : ''
  const path = `/xrpc/${method}${qs}`

  const headers: Record<string, string> = {
    'atproto-proxy': opts?.serviceDid
      ? `${opts.serviceDid}#bsky_appview`
      : HOME_PROXY_HEADER,
  }
  const init: RequestInit = {
    method: opts?.body ? 'POST' : 'GET',
    headers,
  }
  if (opts?.body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  return agent.fetchHandler(path, init)
}

export async function getSpacePostLikes(
  agent: BskyAgent,
  params: {uri: string; limit: number; cursor?: string},
): Promise<AppBskyFeedGetLikes.OutputSchema> {
  const response = await communityXrpc(
    agent,
    'community.blacksky.feed.getSpacePostLikes',
    {
      params: {
        uri: params.uri,
        limit: String(params.limit),
        ...(params.cursor ? {cursor: params.cursor} : {}),
      },
    },
  )
  if (!response.ok) {
    throw new Error(`getSpacePostLikes ${response.status}`)
  }
  return jsonToLex(await response.json()) as AppBskyFeedGetLikes.OutputSchema
}

export async function getSpacePostQuotes(
  agent: BskyAgent,
  params: {uri: string; limit: number; cursor?: string},
): Promise<AppBskyFeedGetQuotes.OutputSchema> {
  const response = await communityXrpc(
    agent,
    'community.blacksky.feed.getSpacePostQuotes',
    {
      params: {
        uri: params.uri,
        limit: String(params.limit),
        ...(params.cursor ? {cursor: params.cursor} : {}),
      },
    },
  )
  if (!response.ok) {
    throw new Error(`getSpacePostQuotes ${response.status}`)
  }
  const data = jsonToLex(await response.json()) as {
    cursor?: string
    posts?: unknown[]
  }
  return {
    uri: params.uri,
    cursor: data.cursor,
    posts: (data.posts ?? [])
      .map(toPostView)
      .filter(
        (post): post is AppBskyFeedGetQuotes.OutputSchema['posts'][number] =>
          Boolean(post),
      ),
  }
}
