import {useMemo} from 'react'
import {type AppBskyUnspeccedDefs, hasMutedWord} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {usePreferencesQuery} from '#/state/queries/preferences'

export type TrendingTopic = AppBskyUnspeccedDefs.TrendingTopic

type Response = {
  topics: TrendingTopic[]
  suggested: TrendingTopic[]
}

export const DEFAULT_LIMIT = 14

export const trendingTopicsQueryKey = ['trending-topics']

const PUBLIC_API = 'https://public.api.bsky.app'

export function useTrendingTopics() {
  const {data: preferences} = usePreferencesQuery()
  const mutedWords = useMemo(() => {
    return preferences?.moderationPrefs?.mutedWords || []
  }, [preferences?.moderationPrefs])

  return useQuery<Response>({
    refetchOnWindowFocus: true,
    staleTime: STALE.MINUTES.THREE,
    queryKey: trendingTopicsQueryKey,
    async queryFn() {
      const res = await fetch(
        `${PUBLIC_API}/xrpc/app.bsky.unspecced.getTrendingTopics?limit=${DEFAULT_LIMIT}`,
      )
      if (!res.ok) {
        throw new Error(`getTrendingTopics failed: ${res.status}`)
      }
      const data = (await res.json()) as Response
      return {
        topics: data.topics ?? [],
        suggested: data.suggested ?? [],
      }
    },
    select(data: Response) {
      return {
        topics: data.topics.filter(t => {
          return !hasMutedWord({
            mutedWords,
            text: t.topic + ' ' + t.displayName + ' ' + t.description,
          })
        }),
        suggested: data.suggested.filter(t => {
          return !hasMutedWord({
            mutedWords,
            text: t.topic + ' ' + t.displayName + ' ' + t.description,
          })
        }),
      }
    },
  })
}
