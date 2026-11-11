import {Client, jsonToLex, lexStringify} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'

import {HOME_PROXY_HEADER} from '#/lib/constants'
import {type app} from '#/lexicons'
import {toPostView} from './space-views'

export type CommunityXrpcParam = string | number | boolean

/*
 * A raw request skips the client's own header construction, so the moderation
 * authorities it would have sent are added here in the same form.
 */
function acceptLabelers(client: Client): string | undefined {
  const appLabelers =
    client.xrpcDefaults.appLabelers === undefined
      ? Client.appLabelers
      : client.xrpcDefaults.appLabelers
  const labelers = [
    ...Array.from(appLabelers ?? [], did => `${did};redact`),
    ...client.labelers,
  ]
  return labelers.length > 0 ? labelers.join(', ') : undefined
}

export async function communityXrpc(
  client: Client,
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
  const path = `/xrpc/${method}${qs}` as const

  const headers: Record<string, string> = {
    'atproto-proxy': opts?.serviceDid
      ? `${opts.serviceDid}#bsky_appview`
      : HOME_PROXY_HEADER,
  }
  const labelers = acceptLabelers(client)
  if (labelers) {
    headers['atproto-accept-labelers'] = labelers
  }
  const init: RequestInit = {
    method: opts?.body ? 'POST' : 'GET',
    headers,
  }
  if (opts?.body) {
    headers['Content-Type'] = 'application/json'
    // Blob references are CID objects, which plain JSON does not encode as links.
    init.body = lexStringify(opts.body)
  }
  return client.agent.fetchHandler(path, init)
}

export async function getSpacePostLikes(
  client: Client,
  params: {uri: string; limit: number; cursor?: string},
): Promise<app.bsky.feed.getLikes.$OutputBody> {
  const response = await communityXrpc(
    client,
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
  return jsonToLex(await response.json()) as app.bsky.feed.getLikes.$OutputBody
}

export async function getSpacePostQuotes(
  client: Client,
  params: {uri: string; limit: number; cursor?: string},
): Promise<app.bsky.feed.getQuotes.$OutputBody> {
  const response = await communityXrpc(
    client,
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
    uri: params.uri as AtUriString,
    cursor: data.cursor,
    posts: (data.posts ?? [])
      .map(toPostView)
      .filter(
        (post): post is app.bsky.feed.getQuotes.$OutputBody['posts'][number] =>
          Boolean(post),
      ),
  }
}
