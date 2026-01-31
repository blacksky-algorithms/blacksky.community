import {useCallback, useMemo, useRef, useState} from 'react'
import {View, type ViewabilityConfig} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'
import * as bcp47Match from 'bcp-47-match'

import {useLanguagePrefs} from '#/state/preferences/languages'
import {Nux, useNux} from '#/state/queries/nuxs'
import {createGetTrendsQueryKey} from '#/state/queries/trending/useGetTrendsQuery'
import {List} from '#/view/com/util/List'
import {ExploreInterestsCard} from '#/screens/Search/modules/ExploreInterestsCard'
import {ExploreTrendingTopics} from '#/screens/Search/modules/ExploreTrendingTopics'
import {atoms as a, native, useTheme} from '#/alf'
import {type Metrics, useAnalytics} from '#/analytics'
import {ExploreScreenLiveEventFeedsBanner} from '#/features/liveEvents/components/ExploreScreenLiveEventFeedsBanner'

type ExploreScreenItems =
  | {
      type: 'topBorder'
      key: string
    }
  | {
      type: 'trendingTopics'
      key: string
    }
  | {
      type: 'interests-card'
      key: 'interests-card'
    }
  | {
      type: 'liveEventFeedsBanner'
      key: string
    }

export function Explore({
  focusSearchInput: _focusSearchInput,
}: {
  focusSearchInput: (tab: 'user' | 'profile' | 'feed') => void
  headerHeight: number
}) {
  const ax = useAnalytics()
  const t = useTheme()

  const {contentLanguages} = useLanguagePrefs()
  const useFullExperience = useMemo(() => {
    if (contentLanguages.length === 0) return true
    return bcp47Match.basicFilter('en', contentLanguages).length > 0
  }, [contentLanguages])

  const interestsNux = useNux(Nux.ExploreInterestsCard)
  const showInterestsNux =
    interestsNux.status === 'ready' && !interestsNux.nux?.completed

  const qc = useQueryClient()
  const [isPTR, setIsPTR] = useState(false)
  const onPTR = useCallback(async () => {
    setIsPTR(true)
    await qc.resetQueries({
      queryKey: createGetTrendsQueryKey(),
    })
    setIsPTR(false)
  }, [qc])

  const topBorder = useMemo(
    () => ({type: 'topBorder', key: 'top-border'}) as const,
    [],
  )
  const trendingTopicsModule = useMemo(
    () => ({type: 'trendingTopics', key: 'trending-topics'}) as const,
    [],
  )

  const interestsNuxModule = useMemo<ExploreScreenItems[]>(() => {
    if (!showInterestsNux) return []
    return [
      {
        type: 'interests-card',
        key: 'interests-card',
      },
    ]
  }, [showInterestsNux])

  const items = useMemo<ExploreScreenItems[]>(() => {
    const i: ExploreScreenItems[] = []

    i.push(topBorder)
    i.push(...interestsNuxModule)
    i.push({type: 'liveEventFeedsBanner', key: 'liveEventFeedsBanner'})

    if (useFullExperience) {
      i.push(trendingTopicsModule)
    }

    return i
  }, [topBorder, trendingTopicsModule, interestsNuxModule, useFullExperience])

  const renderItem = useCallback(
    ({item}: {item: ExploreScreenItems}) => {
      switch (item.type) {
        case 'topBorder':
          return (
            <View style={[a.w_full, t.atoms.border_contrast_low, a.border_t]} />
          )
        case 'trendingTopics': {
          return (
            <View style={[a.pb_md]}>
              <ExploreTrendingTopics />
            </View>
          )
        }
        case 'interests-card': {
          return <ExploreInterestsCard />
        }
        case 'liveEventFeedsBanner': {
          return <ExploreScreenLiveEventFeedsBanner />
        }
      }
    },
    [t.atoms.border_contrast_low],
  )

  const stickyHeaderIndices = useMemo(
    () =>
      items.reduce(
        (acc, curr) =>
          curr.type === 'topBorder' ? acc.concat(items.indexOf(curr)) : acc,
        [] as number[],
      ),
    [items],
  )

  const alreadyReportedRef = useRef<Map<string, string>>(new Map())
  const onItemSeen = useCallback(
    (item: ExploreScreenItems) => {
      let module: Metrics['explore:module:seen']['module']
      if (item.type === 'trendingTopics') {
        module = item.type
      } else {
        return
      }
      if (!alreadyReportedRef.current.has(module)) {
        alreadyReportedRef.current.set(module, module)
        ax.metric('explore:module:seen', {module})
      }
    },
    [ax],
  )

  return (
    <List
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      desktopFixedHeight
      contentContainerStyle={{paddingBottom: 100}}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      stickyHeaderIndices={native(stickyHeaderIndices)}
      viewabilityConfig={viewabilityConfig}
      onItemSeen={onItemSeen}
      refreshing={isPTR}
      onRefresh={onPTR}
    />
  )
}

function keyExtractor(item: ExploreScreenItems) {
  return item.key
}

const viewabilityConfig: ViewabilityConfig = {
  itemVisiblePercentThreshold: 100,
}
