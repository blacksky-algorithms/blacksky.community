import {type BskyAgent} from '@atproto/api'

import {HOME_PROXY_HEADER} from '#/lib/constants'

/**
 * Make an XRPC call to a community.blacksky.feed.* endpoint.
 *
 * Calls through the PDS using the agent's session auth and atproto-proxy
 * header. The PDS validates the user's credentials, creates a service auth
 * JWT signed by the user's keypair, and forwards the request to the appview.
 *
 * Pinned: community.blacksky.* endpoints only exist on the home appview.
 */
export async function communityXrpc(
  agent: BskyAgent,
  method: string,
  opts?: {
    params?: Record<string, string>
    body?: unknown
  },
): Promise<Response> {
  const qs = opts?.params
    ? '?' + new URLSearchParams(opts.params).toString()
    : ''
  const path = `/xrpc/${method}${qs}`

  const headers: Record<string, string> = {
    'atproto-proxy': HOME_PROXY_HEADER,
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
