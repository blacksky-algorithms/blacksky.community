import {type AtpAgent} from '@atproto/api'

import {BLUESKY_FALLBACK_PROXY_HEADER} from '#/lib/constants'
import {metrics} from '#/analytics/metrics'

export type ProbeResult = 'eligible' | 'ineligible' | 'unknown'

const cache = new Map<string, ProbeResult>()

const INELIGIBLE_ERROR_NAMES = ['AccountTakedown', 'AccountDeactivated']
const INELIGIBLE_MESSAGE_FRAGMENTS = ['suspended', 'taken down', 'deactivated']

// Matches broadly — any auth rejection or takedown signal counts, mirroring
// isAuthorModerated in microcosm-fallback.
export async function probeFallbackEligibility(
  agent: AtpAgent,
): Promise<ProbeResult> {
  const did = agent.session?.did
  if (!did) return 'unknown'

  const cached = cache.get(did)
  if (cached && cached !== 'unknown') return cached

  let result: ProbeResult
  let errorName: string | undefined
  let status: number | undefined
  try {
    await agent.app.bsky.actor.getProfile(
      {actor: did},
      {headers: {'atproto-proxy': BLUESKY_FALLBACK_PROXY_HEADER}},
    )
    result = 'eligible'
  } catch (e) {
    const err = e as {status?: number; error?: string}
    errorName = typeof err?.error === 'string' ? err.error : undefined
    status = typeof err?.status === 'number' ? err.status : undefined
    result = classifyProbeError(e)
  }

  cache.set(did, result)
  metrics.track('appviewFallback:probe', {result, errorName, status})
  return result
}

function classifyProbeError(e: unknown): ProbeResult {
  const err = e as {status?: number; error?: string; message?: string}
  const status = typeof err?.status === 'number' ? err.status : undefined
  const name = typeof err?.error === 'string' ? err.error : ''
  const message = typeof err?.message === 'string' ? err.message : ''

  if (status === 401 || status === 403) return 'ineligible'
  if (INELIGIBLE_ERROR_NAMES.includes(name)) return 'ineligible'
  const lower = message.toLowerCase()
  if (INELIGIBLE_MESSAGE_FRAGMENTS.some(f => lower.includes(f))) {
    return 'ineligible'
  }
  // Anything else (network failure, transient 5xx) leaves eligibility
  // undetermined; don't activate fallback on it.
  return 'unknown'
}

export function resetProbeCacheForTesting() {
  cache.clear()
}
