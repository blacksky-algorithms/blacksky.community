import {useCallback, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyFeedDefs} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useBrand} from '#/lib/community/BrandContext'
import {DISCOVER_FEED_URI} from '#/lib/constants'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useGetPopularFeedsQuery} from '#/state/queries/feed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {Loader} from '#/components/Loader'
import {
  AppBar,
  Eyebrow,
  PrimaryButton,
  SelectionRow,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

const FEED_LIMIT = 30

export function StepPinFeeds() {
  const {_} = useLingui()
  const t = useTheme()
  const {state, dispatch} = useOnboardingInternalState()
  const brand = useBrand()

  const defaultPinnedUris = brand.feeds.defaultPinned
    .filter(f => f.type === 'feed' && Boolean(f.value))
    .map(f => f.value)

  const [selected, setSelected] = useState<Set<string>>(() => {
    const seed = state.pinFeedsStepResults.selectedFeedUris.length
      ? state.pinFeedsStepResults.selectedFeedUris
      : defaultPinnedUris
    return new Set(seed)
  })

  const {data: popularFeedsPages, isLoading} = useGetPopularFeedsQuery({
    limit: FEED_LIMIT,
  })
  const feeds = (popularFeedsPages?.pages.flatMap(p => p.feeds) ?? []).filter(
    f => f.uri !== DISCOVER_FEED_URI,
  )

  const toggle = useCallback((uri: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(uri)) {
        next.delete(uri)
      } else {
        next.add(uri)
      }
      return next
    })
  }, [])

  const onContinue = useCallback(() => {
    dispatch({
      type: 'setPinFeedsStepResults',
      selectedFeedUris: [...selected],
    })
    dispatch({type: 'next'})
  }, [dispatch, selected])

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow step={5} total={7} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Find your people</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Join popular community feeds to connect with interesting people and
            conversations.
          </Trans>
        </Text>
      </View>

      {isLoading && feeds.length === 0 ? (
        <View style={[a.align_center, a.py_2xl]}>
          <Loader size="lg" />
        </View>
      ) : (
        <View>
          {feeds.map(feed => (
            <FeedRow
              key={feed.uri}
              feed={feed}
              selected={selected.has(feed.uri)}
              onToggle={toggle}
            />
          ))}
        </View>
      )}

      <PrimaryButton label={_(msg`Continue`)} onPress={onContinue} />
    </View>
  )
}

function FeedRow({
  feed,
  selected,
  onToggle,
}: {
  feed: AppBskyFeedDefs.GeneratorView
  selected: boolean
  onToggle: (uri: string) => void
}) {
  return (
    <SelectionRow
      mode="checkbox"
      selected={selected}
      onPress={() => onToggle(feed.uri)}
      title={feed.displayName}
      subtitle={sanitizeHandle(feed.creator.handle, '@')}
      icon={<UserAvatar type="algo" size={40} avatar={feed.avatar} />}
    />
  )
}
