import {useMemo, useState} from 'react'
import {PixelRatio, Pressable, useWindowDimensions, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {type SavedFeedSourceInfo} from '#/state/queries/feed'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {deriveTileSpan, layoutHeight, packLayout} from './layout'

const TILE_GAP = 8
const TILE_HEIGHT = 160

export function TileBoard({
  feeds,
  onSelectFeed,
  onDiscover,
}: {
  feeds: SavedFeedSourceInfo[]
  onSelectFeed: (feed: SavedFeedSourceInfo) => void
  onDiscover: () => void
}) {
  const {width} = useWindowDimensions()
  const {_} = useLingui()
  const t = useTheme()
  const [boardWidth, setBoardWidth] = useState(width)
  const colW = (boardWidth - TILE_GAP) / 2
  const rowH = TILE_HEIGHT * PixelRatio.getFontScale()
  const rects = useMemo(
    () =>
      packLayout(
        feeds.map((feed, index) => deriveTileSpan(index, feed)),
        colW + TILE_GAP,
        rowH + TILE_GAP,
      ),
    [feeds, colW, rowH],
  )
  const height = layoutHeight(rects)

  return (
    <View
      style={[a.flex_1, a.px_lg, a.pt_md]}
      onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
      <View style={{height}}>
        {feeds.map((feed, index) => {
          const rect = rects[index]
          return (
            <Pressable
              key={feed.feedDescriptor}
              accessibilityRole="button"
              accessibilityLabel={feed.displayName}
              accessibilityHint={_(msg`Opens this feed`)}
              onPress={() => onSelectFeed(feed)}
              style={[
                a.absolute,
                a.rounded_md,
                a.p_md,
                t.atoms.bg_contrast_25,
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.w - TILE_GAP,
                  height: rect.h - TILE_GAP,
                },
              ]}>
              <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
                {feed.displayName}
              </Text>
              <Text
                style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}>
                <Trans>Open feed</Trans>
              </Text>
            </Pressable>
          )
        })}
        {feeds.length < 3 && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={_(msg`Opens the feed explorer`)}
            onPress={onDiscover}
            style={[
              a.rounded_md,
              a.p_md,
              t.atoms.bg_contrast_25,
              {marginTop: height + TILE_GAP},
            ]}>
            <Text style={[a.text_md, a.font_bold]}>
              <Trans>Find feeds</Trans>
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
              <Trans>Explore more feeds to pin here.</Trans>
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
