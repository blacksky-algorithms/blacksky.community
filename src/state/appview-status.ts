import {APPVIEW_STATUS_URL} from '#/lib/constants'
import {Features, features} from '#/analytics/features'

export type StatusSample = {
  lagSeconds: number | null
  queueLength: number | null
}

export type FallbackThresholds = {
  enterLagSeconds: number
  exitLagSeconds: number
  enterQueueLength: number
  exitQueueLength: number
  enterConsecutive: number
  exitConsecutive: number
}

export const DEFAULT_THRESHOLDS: FallbackThresholds = {
  enterLagSeconds: 300,
  exitLagSeconds: 60,
  enterQueueLength: 300_000,
  exitQueueLength: 60_000,
  enterConsecutive: 2,
  exitConsecutive: 3,
}

export function getThresholds(): FallbackThresholds {
  const value = features.getFeatureValue(
    Features.AppviewFallbackThresholds,
    {},
  ) as Partial<FallbackThresholds>
  return {...DEFAULT_THRESHOLDS, ...value}
}

export async function fetchStatusSample(): Promise<StatusSample | null> {
  try {
    const res = await fetch(APPVIEW_STATUS_URL)
    if (!res.ok) return null
    const body = (await res.json()) as {
      ingestLagSeconds?: unknown
      indexerQueueLength?: unknown
    }
    return {
      lagSeconds:
        typeof body.ingestLagSeconds === 'number'
          ? body.ingestLagSeconds
          : null,
      queueLength:
        typeof body.indexerQueueLength === 'number'
          ? body.indexerQueueLength
          : null,
    }
  } catch {
    return null
  }
}

export type DeciderState = {
  active: boolean
  badCount: number
  goodCount: number
}

export const INITIAL_DECIDER_STATE: DeciderState = {
  active: false,
  badCount: 0,
  goodCount: 0,
}

/**
 * Asymmetric enter/exit: harder to leave a state than to enter it, so lag
 * hovering at a threshold can't flip the app back and forth on every poll.
 * A failed poll (null sample) is uninformative and never moves the counters:
 * an unreachable status endpoint is usually the user's own network.
 */
export function decide(
  state: DeciderState,
  sample: StatusSample | null,
  t: FallbackThresholds,
): DeciderState {
  if (!sample || (sample.lagSeconds === null && sample.queueLength === null)) {
    return state
  }

  const bad =
    (sample.lagSeconds !== null && sample.lagSeconds > t.enterLagSeconds) ||
    (sample.queueLength !== null && sample.queueLength > t.enterQueueLength)
  const good =
    (sample.lagSeconds === null || sample.lagSeconds < t.exitLagSeconds) &&
    (sample.queueLength === null || sample.queueLength < t.exitQueueLength)

  if (!state.active) {
    const badCount = bad ? state.badCount + 1 : 0
    if (badCount >= t.enterConsecutive) {
      return {active: true, badCount: 0, goodCount: 0}
    }
    return {...state, badCount}
  }

  const goodCount = good ? state.goodCount + 1 : 0
  if (goodCount >= t.exitConsecutive) {
    return {active: false, badCount: 0, goodCount: 0}
  }
  return {...state, goodCount}
}
