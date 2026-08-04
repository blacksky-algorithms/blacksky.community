import {useCallback, useEffect} from 'react'
import {AppState} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {setFallbackActive} from '#/state/appview-fallback'
import {probeFallbackEligibility} from '#/state/appview-fallback-probe'
import {useAlwaysUseHomeAppview} from '#/state/preferences'
import {useAgent, useSession} from '#/state/session'
import {Features, features} from '#/analytics/features'

const RECHECK_INTERVAL = 3 * 60e3

type FallbackMode = 'auto' | 'force-fallback' | 'force-primary'

function getMode(): FallbackMode {
  const value = features.getFeatureValue(
    Features.AppviewFallbackMode,
    'force-primary',
  )
  if (value === 'force-fallback' || value === 'auto') return value
  return 'force-primary'
}

/**
 * Headless component that decides whether app.bsky.* reads should be served
 * by the fallback appview. v1: driven entirely by the feature flag ('auto'
 * behaves as 'force-primary' until the lag poller lands).
 */
export function AppviewFallbackController() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {hasSession} = useSession()
  const alwaysUseHomeAppview = useAlwaysUseHomeAppview()

  const evaluate = useCallback(async () => {
    if (!hasSession) {
      setFallbackActive(false, agent, queryClient)
      return
    }
    const wantsFallback = getMode() === 'force-fallback'

    if (!wantsFallback || alwaysUseHomeAppview) {
      setFallbackActive(false, agent, queryClient)
      return
    }

    const eligibility = await probeFallbackEligibility(agent)
    setFallbackActive(eligibility === 'eligible', agent, queryClient)
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
