import {useCallback, useMemo} from 'react'
import {type AppBskyUnspeccedGetTrends, hasMutedWord} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {
  aggregateUserInterests,
  createBskyTopicsHeader,
} from '#/lib/api/feed/utils'
import {logger} from '#/logger'
import {getContentLanguages} from '#/state/preferences/languages'
import {STALE} from '#/state/queries'
import {usePreferencesQuery} from '#/state/queries/preferences'

export const DEFAULT_LIMIT = 5

type QueryProps = {
  limit?: number
  refetchOnWindowFocus?: boolean
}

function dedupe<T extends {link: string}>(trends: T[]): T[] {
  const seen = new Set<string>()
  return trends.filter(trend => {
    if (seen.has(trend.link)) return false
    seen.add(trend.link)
    return true
  })
}

export const createGetTrendsQueryKey = (limit?: number) =>
  limit === undefined ? ['trends'] : ['trends', {limit}]

const PUBLIC_API = 'https://api.blacksky.community'

export function useGetTrendsQuery(props: QueryProps = {}) {
  const {data: preferences} = usePreferencesQuery()
  const limit = props.limit ?? DEFAULT_LIMIT
  const mutedWords = useMemo(() => {
    return preferences?.moderationPrefs?.mutedWords || []
  }, [preferences?.moderationPrefs])

  return useQuery({
    enabled: !!preferences,
    refetchOnWindowFocus: props.refetchOnWindowFocus,
    staleTime: STALE.MINUTES.THREE,
    queryKey: createGetTrendsQueryKey(limit),
    queryFn: async () => {
      const contentLangs = getContentLanguages().join(',')
      const params = new URLSearchParams({limit: String(limit)})
      const res = await fetch(
        `${PUBLIC_API}/xrpc/app.bsky.unspecced.getTrends?${params}`,
        {
          headers: {
            ...createBskyTopicsHeader(aggregateUserInterests(preferences)),
            'Accept-Language': contentLangs,
          },
        },
      )
      if (!res.ok) {
        throw new Error(`getTrends failed: ${res.status}`)
      }
      const data = (await res.json()) as AppBskyUnspeccedGetTrends.OutputSchema
      if (!data.recIdStr) {
        logger.debug('useGetTrendsQuery response missing recIdStr')
      }
      return data
    },
    select: useCallback(
      (data: AppBskyUnspeccedGetTrends.OutputSchema) => {
        return {
          recId: data.recIdStr,
          trends: dedupe(
            (data.trends ?? []).filter(t => {
              return !hasMutedWord({
                mutedWords,
                text: `${t.topic} ${t.displayName} ${t.category}`,
              })
            }),
          ),
        }
      },
      [mutedWords],
    ),
  })
}
