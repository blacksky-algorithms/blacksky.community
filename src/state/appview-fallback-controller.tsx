import {useCallback, useEffect, useRef} from 'react'
import {AppState} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {type FallbackMode, setFallbackActive} from '#/state/appview-fallback'
import {probeFallbackEligibility} from '#/state/appview-fallback-probe'
import {
  isHomeAppviewOutage,
  subscribe as subscribeOutage,
} from '#/state/appview-health'
import {
  decide,
  type DeciderState,
  fetchStatusSample,
  getThresholds,
  INITIAL_DECIDER_STATE,
} from '#/state/appview-status'
import {useAgent, useSession} from '#/state/session'
import {Features, features, init as featuresInit} from '#/analytics/features'

const RECHECK_INTERVAL = 3 * 60e3

function getMode(): FallbackMode {
  const value = features.getFeatureValue(Features.AppviewFallbackMode, 'auto')
  if (value === 'force-fallback' || value === 'force-primary') return value
  return 'auto'
}

export function AppviewFallbackController() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {hasSession} = useSession()
  const deciderRef = useRef<DeciderState>(INITIAL_DECIDER_STATE)
  const epochRef = useRef(0)

  const evaluate = useCallback(async () => {
    // Evaluations await network (status poll, eligibility probe) and can fire
    // concurrently from the interval, foregrounding, and outage transitions.
    // Only the newest run may apply a result: a stale run resolving late would
    // otherwise overwrite a fresher decision with an outdated one.
    const epoch = ++epochRef.current
    const apply = (next: boolean, trigger?: FallbackMode) => {
      if (epoch !== epochRef.current) return
      setFallbackActive(next, agent, queryClient, trigger)
    }

    // The flag defaults to 'auto' until GrowthBook has loaded; acting on that
    // default would override an operator-set force-* mode during launch.
    await featuresInit

    if (!hasSession) {
      apply(false)
      return
    }

    const mode = getMode()
    if (mode === 'force-primary') {
      apply(false)
      return
    }

    let wantsFallback: boolean
    if (mode === 'force-fallback') {
      wantsFallback = true
    } else if (isHomeAppviewOutage()) {
      wantsFallback = true
    } else {
      const sample = await fetchStatusSample()
      deciderRef.current = decide(deciderRef.current, sample, getThresholds())
      wantsFallback = deciderRef.current.active
    }

    if (!wantsFallback) {
      apply(false)
      return
    }

    const eligibility = await probeFallbackEligibility(agent)
    apply(eligibility === 'eligible', mode)
  }, [agent, queryClient, hasSession])

  useEffect(() => {
    void evaluate()

    const interval = setInterval(() => void evaluate(), RECHECK_INTERVAL)
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void evaluate()
    })
    const unsubOutage = subscribeOutage(() => void evaluate())
    return () => {
      clearInterval(interval)
      sub.remove()
      unsubOutage()
    }
  }, [evaluate])

  return null
}
