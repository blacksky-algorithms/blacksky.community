import {useSyncExternalStore} from 'react'

import {HOME_PROXY_HEADER} from '#/lib/constants'
import {logger} from '#/logger'
import {metrics} from '#/analytics/metrics'

const OUTAGE_CONSECUTIVE_FAILURES = 8

let consecutiveFailures = 0
let outage = false
const listeners = new Set<() => void>()

export function isHomeAppviewOutage(): boolean {
  return outage
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useHomeAppviewOutage(): boolean {
  return useSyncExternalStore(
    subscribe,
    isHomeAppviewOutage,
    isHomeAppviewOutage,
  )
}

function getProxyHeader(init: RequestInit | undefined): string | null {
  if (!init?.headers) return null
  if (init.headers instanceof Headers) {
    return init.headers.get('atproto-proxy')
  }
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(
      ([k]) => k.toLowerCase() === 'atproto-proxy',
    )
    return entry?.[1] ?? null
  }
  const record = init.headers
  return record['atproto-proxy'] ?? record['Atproto-Proxy'] ?? null
}

/**
 * Circuit breaker over home-appview-bound requests. Only 5xx and network
 * failures count — 4xx means the appview answered. Only requests whose
 * proxy header targets the home appview are relevant; during fallback,
 * pinned calls (community, notifications) keep feeding this, and the
 * 30-second notifications unread poll gives it a steady heartbeat.
 */
export function reportProxiedFetch(
  init: RequestInit | undefined,
  status: number | null,
): void {
  if (getProxyHeader(init) !== HOME_PROXY_HEADER) return

  const failed = status === null || status >= 500
  if (!failed) {
    consecutiveFailures = 0
    setOutage(false)
    return
  }

  consecutiveFailures++
  if (consecutiveFailures >= OUTAGE_CONSECUTIVE_FAILURES) {
    setOutage(true)
  }
}

function setOutage(next: boolean): void {
  if (next === outage) return
  outage = next
  logger.info('home appview outage state changed', {outage: next})
  metrics.track('appviewFallback:outage', {active: next})
  listeners.forEach(fn => fn())
}

export function resetForTesting(): void {
  consecutiveFailures = 0
  outage = false
  listeners.clear()
}
