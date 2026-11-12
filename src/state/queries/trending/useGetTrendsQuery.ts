import {useCallback, useMemo} from 'react'
import {hasMutedWord} from '@bsky/sdk/moderation'
import {useQuery} from '@tanstack/react-query'

import {
  aggregateUserInterests,
  createBskyTopicsHeader,
} from '#/lib/api/feed/utils'
import {logger} from '#/logger'
import {getContentLanguages} from '#/state/preferences/languages'
import {STALE} from '#/state/queries'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {type app} from '#/lexicons'

export const DEFAULT_LIMIT = 10
export const DEFAULT_FETCH_LIMIT = 20

type QueryProps = {
  fetchLimit?: number
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

export function filterTrends(
  trends: app.bsky.unspecced.getTrends.$OutputBody['trends'],
  mutedWords: Parameters<typeof hasMutedWord>[0]['mutedWords'],
  limit: number,
) {
  return dedupe(
    trends.filter(trend => {
      return !hasMutedWord({
        mutedWords,
        text: `${trend.topic} ${trend.displayName} ${trend.category}`,
      })
    }),
  ).slice(0, limit)
}

export const createGetTrendsQueryKey = (fetchLimit?: number) =>
  fetchLimit === undefined ? ['trends'] : ['trends', {limit: fetchLimit}]

const PUBLIC_API = 'https://api.blacksky.community'

export function useGetTrendsQuery(props: QueryProps = {}) {
  const {data: preferences} = usePreferencesQuery()
  const fetchLimit = props.fetchLimit ?? DEFAULT_FETCH_LIMIT
  const limit = props.limit ?? DEFAULT_LIMIT
  const mutedWords = useMemo(() => {
    return preferences?.moderationPrefs?.mutedWords || []
  }, [preferences?.moderationPrefs])

  return useQuery({
    enabled: !!preferences,
    refetchOnWindowFocus: props.refetchOnWindowFocus,
    staleTime: STALE.MINUTES.THREE,
    queryKey: createGetTrendsQueryKey(fetchLimit),
    queryFn: async () => {
      const contentLangs = getContentLanguages().join(',')
      const params = new URLSearchParams({limit: String(fetchLimit)})
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
      const data =
        (await res.json()) as app.bsky.unspecced.getTrends.$OutputBody
      if (!data.recIdStr) {
        logger.debug('useGetTrendsQuery response missing recIdStr')
      }
      return data
    },
    select: useCallback(
      (data: app.bsky.unspecced.getTrends.$OutputBody) => {
        return {
          recId: data.recIdStr,
          trends: filterTrends(data.trends ?? [], mutedWords, limit),
        }
      },
      [limit, mutedWords],
    ),
  })
}
