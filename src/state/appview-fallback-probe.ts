import {type Client} from '@atproto/lex'

import {BLUESKY_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {getErrorName, getErrorStatus} from '#/lib/xrpc-error'
import {metrics} from '#/analytics/metrics'
import {app} from '#/lexicons'

export type ProbeResult = 'eligible' | 'ineligible' | 'unknown'

const PROBE_TTL_MS = 60 * 60e3

const cache = new Map<string, {result: ProbeResult; at: number}>()
const lastTracked = new Map<string, ProbeResult>()

const INELIGIBLE_ERROR_NAMES = ['AccountTakedown', 'AccountDeactivated']
const INELIGIBLE_MESSAGE_FRAGMENTS = ['suspended', 'taken down', 'deactivated']

// Matches broadly — any auth rejection or takedown signal counts, mirroring
// isAuthorModerated in microcosm-fallback. Definitive results expire after
// PROBE_TTL_MS so a status change is picked up within the hour.
export async function probeFallbackEligibility(
  client: Client,
): Promise<ProbeResult> {
  const did = client.did
  if (!did) return 'unknown'

  const cached = cache.get(did)
  if (
    cached &&
    cached.result !== 'unknown' &&
    Date.now() - cached.at < PROBE_TTL_MS
  ) {
    return cached.result
  }

  let result: ProbeResult
  let errorName: string | undefined
  let status: number | undefined
  try {
    await client.call(
      app.bsky.actor.getProfile,
      {actor: did},
      BLUESKY_APPVIEW_PINNED_OPTS,
    )
    result = 'eligible'
  } catch (e) {
    errorName = getErrorName(e)
    status = getErrorStatus(e)
    result = classifyProbeError(e)
  }

  cache.set(did, {result, at: Date.now()})
  if (lastTracked.get(did) !== result) {
    lastTracked.set(did, result)
    metrics.track('appviewFallback:probe', {result, errorName, status})
  }
  return result
}

function classifyProbeError(e: unknown): ProbeResult {
  const status = getErrorStatus(e)
  const name = getErrorName(e) ?? ''
  const message = e instanceof Error ? e.message : ''

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
  lastTracked.clear()
}
