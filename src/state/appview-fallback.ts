import {useSyncExternalStore} from 'react'
import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {logger} from '#/logger'
import {metrics} from '#/analytics/metrics'

export type FallbackMode = 'auto' | 'force-fallback' | 'force-primary'

let active = false
const listeners = new Set<() => void>()

export function isFallbackActive(): boolean {
  return active
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// Pagination cursors are appview-specific: a cached page from one appview
// must never be continued against the other, hence the cache reset on flip.
export function setFallbackActive(
  next: boolean,
  agent: AtpAgent,
  queryClient: QueryClient,
): void {
  if (next === active) return
  active = next
  const header = next ? BLUESKY_FALLBACK_PROXY_HEADER : HOME_PROXY_HEADER
  BLUESKY_PROXY_HEADER.set(header)
  agent.configureProxy(header)
  void queryClient.resetQueries()
  logger.info('appview fallback changed', {active: next})
  metrics.track('appviewFallback:changed', {active: next, trigger: 'flag'})
  listeners.forEach(fn => fn())
}

export function useAppviewFallback(): boolean {
  return useSyncExternalStore(subscribe, isFallbackActive, isFallbackActive)
}
