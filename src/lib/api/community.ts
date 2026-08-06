import {type BskyAgent} from '@atproto/api'

import {HOME_PROXY_HEADER} from '#/lib/constants'

export async function communityXrpc(
  agent: BskyAgent,
  method: string,
  opts?: {
    params?: Record<string, string>
    body?: unknown
    serviceDid?: string
  },
): Promise<Response> {
  const qs = opts?.params
    ? '?' + new URLSearchParams(opts.params).toString()
    : ''
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
