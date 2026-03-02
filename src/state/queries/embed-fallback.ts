import {useQuery, useQueryClient} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {buildSyntheticEmbedViewRecord} from './microcosm-fallback'

const RQKEY_ROOT = 'embed-fallback'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]

export function useEmbedFallback({uri}: {uri: string}) {
  const queryClient = useQueryClient()

  return useQuery({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(uri),
    async queryFn() {
      const result = await buildSyntheticEmbedViewRecord(queryClient, uri)
      return result ?? undefined
    },
    enabled: !!uri,
  })
}
