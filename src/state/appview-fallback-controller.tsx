import {useCallback, useEffect, useRef} from 'react'
import {AppState} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {type FallbackMode, setFallbackActive} from '#/state/appview-fallback'
import {probeFallbackEligibility} from '#/state/appview-fallback-probe'
import {
  decide,
  type DeciderState,
  fetchStatusSample,
  getThresholds,
  INITIAL_DECIDER_STATE,
} from '#/state/appview-status'
import {useAlwaysUseHomeAppview} from '#/state/preferences'
import {useAgent, useSession} from '#/state/session'
import {Features, features} from '#/analytics/features'

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
  const alwaysUseHomeAppview = useAlwaysUseHomeAppview()
  const deciderRef = useRef<DeciderState>(INITIAL_DECIDER_STATE)

  const evaluate = useCallback(async () => {
    if (!hasSession || alwaysUseHomeAppview) {
      setFallbackActive(false, agent, queryClient)
      return
    }

    const mode = getMode()
    if (mode === 'force-primary') {
      setFallbackActive(false, agent, queryClient)
      return
    }

    let wantsFallback: boolean
    if (mode === 'force-fallback') {
      wantsFallback = true
    } else {
      const sample = await fetchStatusSample()
      deciderRef.current = decide(deciderRef.current, sample, getThresholds())
      wantsFallback = deciderRef.current.active
    }

    if (!wantsFallback) {
      setFallbackActive(false, agent, queryClient)
      return
    }

    const eligibility = await probeFallbackEligibility(agent)
    setFallbackActive(eligibility === 'eligible', agent, queryClient, mode)
  }, [agent, queryClient, hasSession, alwaysUseHomeAppview])

  useEffect(() => {
    void evaluate()

    const interval = setInterval(() => void evaluate(), RECHECK_INTERVAL)
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void evaluate()
    })
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [evaluate])

  return null
}
