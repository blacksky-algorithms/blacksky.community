import {useEffect, useRef} from 'react'
import {type QueryClient, useQueryClient} from '@tanstack/react-query'

import {fetchRecordViaSlingshot} from './microcosm-fallback'

/**
 * Determines if a profile object is "incomplete" -- present in the appview
 * response but missing key fields that indicate the profile record hasn't
 * been synced yet.
 *
 * A profile is considered incomplete when it has a DID but is missing BOTH
 * avatar and displayName. This distinguishes "not yet synced" from "user
 * intentionally has no avatar" (they'd still have a displayName).
 */
function isIncompleteProfile(profile: any): boolean {
  if (!profile || typeof profile !== 'object') return false
  if (!profile.did || typeof profile.did !== 'string') return false
  if (profile.__enriched) return false
  if (profile.__fallbackMode) return false
  if (profile.avatar) return false
  if (profile.displayName) return false
  if (!('handle' in profile)) return false
  return true
}

/**
 * Recursively find incomplete profile-like objects in any data structure.
 * Collects unique DIDs of incomplete profiles.
 *
 * Uses a depth limit and visited set to prevent infinite recursion on
 * circular references or excessively deep structures.
 */
function collectIncompleteProfileDids(
  data: any,
  dids: Set<string>,
  visited: WeakSet<object>,
  depth: number,
): void {
  if (!data || typeof data !== 'object' || depth > 15) return
  if (visited.has(data)) return
  visited.add(data)

  if (Array.isArray(data)) {
    for (const item of data) {
      collectIncompleteProfileDids(item, dids, visited, depth + 1)
    }
    return
  }

  // Check if this object looks like a profile
  if (data.did && typeof data.did === 'string' && data.did.startsWith('did:')) {
    if (isIncompleteProfile(data)) {
      dids.add(data.did)
    }
  }

  // Recurse into object values
  for (const key of Object.keys(data)) {
    if (key === 'queryClient' || key === '_queryClient') continue
    collectIncompleteProfileDids(data[key], dids, visited, depth + 1)
  }
}

/**
 * Fetch a profile record from Slingshot and extract enrichment fields.
 */
async function fetchProfileEnrichment(did: string): Promise<{
  displayName: string
  description: string
  avatar: string | undefined
  banner: string | undefined
} | null> {
  try {
    const profileUri = `at://${did}/app.bsky.actor.profile/self`
    const record = await fetchRecordViaSlingshot(profileUri)
    if (!record?.value) return null

    const value = record.value
    if (!value.displayName && !value.avatar) return null

    return {
      displayName: value.displayName || '',
      description: value.description || '',
      avatar: value.avatar?.ref?.$link
        ? `https://cdn.bsky.app/img/avatar/plain/${did}/${value.avatar.ref.$link}@jpeg`
        : undefined,
      banner: value.banner?.ref?.$link
        ? `https://cdn.bsky.app/img/banner/plain/${did}/${value.banner.ref.$link}@jpeg`
        : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Walk all queries in the cache, find profile objects matching `did`,
 * apply enrichment fields, and notify React Query of the change.
 */
function applyEnrichment(
  queryClient: QueryClient,
  did: string,
  enrichment: {
    displayName: string
    description: string
    avatar: string | undefined
    banner: string | undefined
  },
): void {
  const queries = queryClient.getQueryCache().getAll()

  for (const query of queries) {
    const data = query.state.data
    if (!data) continue

    const mutated = mutateProfilesInData(
      data,
      did,
      enrichment,
      new WeakSet(),
      0,
    )
    if (mutated) {
      // Suppress our own subscriber from re-scanning this update
      isApplyingEnrichment = true
      queryClient.setQueryData(query.queryKey, {...(data as any)})
      isApplyingEnrichment = false
    }
  }
}

/**
 * Recursively find and mutate profile objects matching `did` in any data
 * structure. Returns true if any mutations were made.
 */
function mutateProfilesInData(
  data: any,
  did: string,
  enrichment: {
    displayName: string
    description: string
    avatar: string | undefined
    banner: string | undefined
  },
  visited: WeakSet<object>,
  depth: number,
): boolean {
  if (!data || typeof data !== 'object' || depth > 15) return false
  if (visited.has(data)) return false
  visited.add(data)

  let mutated = false

  if (Array.isArray(data)) {
    for (const item of data) {
      if (mutateProfilesInData(item, did, enrichment, visited, depth + 1)) {
        mutated = true
      }
    }
    return mutated
  }

  // Check if this object is the target profile
  if (
    data.did === did &&
    typeof data.did === 'string' &&
    'handle' in data &&
    !data.__enriched
  ) {
    if (enrichment.displayName && !data.displayName) {
      data.displayName = enrichment.displayName
    }
    if (enrichment.description && 'description' in data && !data.description) {
      data.description = enrichment.description
    }
    if (enrichment.avatar && !data.avatar) {
      data.avatar = enrichment.avatar
    }
    if (enrichment.banner && 'banner' in data && !data.banner) {
      data.banner = enrichment.banner
    }
    data.__enriched = true
    mutated = true
  }

  // Recurse into nested objects
  for (const key of Object.keys(data)) {
    if (key === 'queryClient' || key === '_queryClient') continue
    if (mutateProfilesInData(data[key], did, enrichment, visited, depth + 1)) {
      mutated = true
    }
  }

  return mutated
}

// Guard flag to prevent re-scanning when we call setQueryData ourselves
let isApplyingEnrichment = false

// Track DIDs we've already attempted enrichment for (per session)
let enrichedDids = new Set<string>()
let inFlightDids = new Set<string>()
let pendingDids = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let currentQueryClient: QueryClient | null = null

/**
 * Schedule enrichment with debouncing. Batches requests when many
 * incomplete profiles arrive at once (e.g., loading a followers page).
 */
function scheduleEnrichment(queryClient: QueryClient): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    const batch = pendingDids
    pendingDids = new Set()
    if (batch.size === 0) return
    processBatch(queryClient, batch)
  }, 200)
}

async function processBatch(
  queryClient: QueryClient,
  dids: Set<string>,
): Promise<void> {
  const didArray = [...dids]
  const CONCURRENCY = 8

  for (let i = 0; i < didArray.length; i += CONCURRENCY) {
    const chunk = didArray.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async did => {
        const enrichment = await fetchProfileEnrichment(did)
        return {did, enrichment}
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        inFlightDids.delete(result.value.did)
        if (result.value.enrichment) {
          applyEnrichment(
            queryClient,
            result.value.did,
            result.value.enrichment,
          )
        }
      }
    }
  }
}

function queueDidsForEnrichment(
  queryClient: QueryClient,
  dids: Set<string>,
): void {
  let hasNew = false
  for (const did of dids) {
    if (!enrichedDids.has(did) && !inFlightDids.has(did)) {
      pendingDids.add(did)
      inFlightDids.add(did)
      enrichedDids.add(did)
      hasNew = true
    }
  }
  if (hasNew) {
    scheduleEnrichment(queryClient)
  }
}

/**
 * Global React hook that enriches incomplete profiles via Slingshot.
 *
 * Mount this ONCE at the app level (e.g., in ShellInner).
 * It subscribes to the TanStack Query cache and automatically detects
 * incomplete profiles across ALL query types: followers, follows,
 * notifications, DMs, search, post feeds, hover cards, etc.
 *
 * When an incomplete profile is detected (has DID but no avatar AND no
 * displayName), it fetches the profile record from the user's PDS via
 * Slingshot and enriches the cached data with avatar URL, displayName,
 * description, and banner.
 */
export function useProfileEnrichment(): void {
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    // Reset state when query client changes (e.g., account switch)
    if (currentQueryClient !== queryClient) {
      enrichedDids = new Set()
      inFlightDids = new Set()
      pendingDids = new Set()
      currentQueryClient = queryClient
    }

    const cache = queryClient.getQueryCache()

    // Initial scan of existing cache
    const allDids = new Set<string>()
    for (const query of cache.getAll()) {
      if (query.state.data) {
        collectIncompleteProfileDids(
          query.state.data,
          allDids,
          new WeakSet(),
          0,
        )
      }
    }
    if (allDids.size > 0) {
      queueDidsForEnrichment(queryClient, allDids)
    }

    // Subscribe to new query data
    const unsubscribe = cache.subscribe(event => {
      if (isApplyingEnrichment) return
      if (event.type !== 'updated') return
      if (event.action?.type !== 'success') return

      const data = event.query.state.data
      if (!data) return

      const dids = new Set<string>()
      collectIncompleteProfileDids(data, dids, new WeakSet(), 0)
      if (dids.size > 0) {
        queueDidsForEnrichment(queryClientRef.current, dids)
      }
    })

    return () => {
      unsubscribe()
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
    }
  }, [queryClient])
}
