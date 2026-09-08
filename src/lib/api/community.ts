import {type BskyAgent} from '@atproto/api'

import {
  CHAT_NOTIF_PROXY_HEADER,
  HOME_PROXY_HEADER,
  PUBLIC_APPVIEW_DID,
} from '#/lib/constants'
import {type ProxyHeaderValue} from '#/state/session/agent'

const CHAT_RELAY_METHODS = new Set([
  'community.blacksky.courier.startEnrollment',
  'community.blacksky.courier.getEnrollmentStatus',
  'community.blacksky.courier.disconnect',
  'chat.bsky.notification.getPreferences',
  'chat.bsky.notification.putPreferences',
])

function developmentCourierOrigin(): string | undefined {
  if (!__DEV__ || !process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL) return undefined
  const url = new URL(process.env.EXPO_PUBLIC_CHAT_RELAY_DEV_URL)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'The development Courier URL must be an HTTPS origin or local HTTP origin',
    )
  }
  return url.origin
}

/**
 * Make an XRPC call to a community endpoint.
 *
 * Calls through the account's PDS with the supplied proxy header.
 */
export async function communityXrpc(
  agent: BskyAgent,
  method: string,
  opts?: {
    params?: Record<string, string>
    body?: unknown
    proxyHeader?: ProxyHeaderValue
  },
): Promise<Response> {
  const qs = opts?.params
    ? '?' + new URLSearchParams(opts.params).toString()
    : ''
  const path = `/xrpc/${method}${qs}`

  const developmentOrigin =
    opts?.proxyHeader === CHAT_NOTIF_PROXY_HEADER
      ? developmentCourierOrigin()
      : undefined
  if (developmentOrigin) {
    if (!CHAT_RELAY_METHODS.has(method))
      throw new Error('Unsupported development Courier method')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const {data} = await agent.com.atproto.server.getServiceAuth(
        {
          aud: PUBLIC_APPVIEW_DID,
          lxm: method,
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        {signal: controller.signal, headers: {'atproto-proxy': undefined}},
      )
      if (!data.token)
        throw new Error('Could not authorize the development Courier request')
      return await fetch(`${developmentOrigin}${path}`, {
        method: opts?.body !== undefined ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${data.token}`,
          accept: 'application/json',
          'ngrok-skip-browser-warning': '1',
          ...(opts?.body !== undefined
            ? {'content-type': 'application/json'}
            : {}),
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  const headers: Record<string, string> = {
    'atproto-proxy': opts?.proxyHeader ?? HOME_PROXY_HEADER,
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
