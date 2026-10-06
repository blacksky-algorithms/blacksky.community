import {useMemo} from 'react'
import {AtpAgent, interpretLabelValueDefinitions} from '@atproto/api'

import {withAdultContentBehavior} from '#/lib/moderation/adult-content-labels'
import {isNonConfigurableModerationAuthority} from '#/state/session/additional-moderation-authorities'
import {useLabelersDetailedInfoQuery} from '../labeler'
import {usePreferencesQuery} from './index'

export function useMyLabelersQuery({
  excludeNonConfigurableLabelers = false,
}: {
  excludeNonConfigurableLabelers?: boolean
} = {}) {
  const prefs = usePreferencesQuery()
  let dids = Array.from(
    new Set(
      AtpAgent.appLabelers.concat(
        prefs.data?.moderationPrefs.labelers.map(l => l.did) || [],
      ),
    ),
  )
  if (excludeNonConfigurableLabelers) {
    dids = dids.filter(did => !isNonConfigurableModerationAuthority(did))
  }
  const labelers = useLabelersDetailedInfoQuery({dids})
  const isLoading = prefs.isLoading || labelers.isLoading
  const error = prefs.error || labelers.error
  return useMemo(() => {
    return {
      isLoading,
      error,
      data: labelers.data,
      refetch: labelers.refetch,
    }
  }, [labelers, isLoading, error])
}

export function useLabelDefinitionsQuery() {
  const labelers = useMyLabelersQuery()
  return useMemo(() => {
    return {
      labelDefs: Object.fromEntries(
        (labelers.data || []).map(labeler => [
          labeler.creator.did,
          withAdultContentBehavior(interpretLabelValueDefinitions(labeler)),
        ]),
      ),
      labelers: labelers.data || [],
    }
  }, [labelers])
}
