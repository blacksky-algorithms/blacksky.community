import {AtpAgent} from '@atproto/api'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {STALE} from '#/state/queries'
import {buildSyntheticEmbedViewRecord} from './microcosm-fallback'

const RQKEY_ROOT = 'embed-fallback'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]

export function useEmbedFallback({uri}: {uri: string}) {
  const queryClient = useQueryClient()
  const moderationOpts = useModerationOpts()
  const labelerDids =
    moderationOpts?.prefs.labelers.map(l => l.did) ?? AtpAgent.appLabelers

  return useQuery({
    staleTime: STALE.HOURS.ONE,
    queryKey: [...RQKEY(uri), labelerDids.join(',')],
    async queryFn() {
      const result = await buildSyntheticEmbedViewRecord(
        queryClient,
        uri,
        labelerDids,
      )
      return result ?? undefined
    },
    enabled: !!uri,
  })
}
