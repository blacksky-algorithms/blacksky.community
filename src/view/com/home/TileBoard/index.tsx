import {useEffect, useMemo, useState} from 'react'
import {PixelRatio, Pressable, ScrollView, useWindowDimensions, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {type SavedFeedSourceInfo} from '#/state/queries/feed'
import {useFeedPeekQuery} from '#/state/queries/feed-peek'
import {UserAvatar} from '#/view/com/util/UserAvatar'
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
  const [firstBatchDone, setFirstBatchDone] = useState(false)
  const colW = (boardWidth - TILE_GAP) / 2
  const rowH = TILE_HEIGHT * PixelRatio.getFontScale()
  const showDiscovery = feeds.length < 3
  const rects = useMemo(
    () =>
      packLayout(
        [
          ...feeds.map((feed, index) => deriveTileSpan(index, feed)),
          ...(showDiscovery ? [1 as const] : []),
        ],
        colW + TILE_GAP,
        rowH + TILE_GAP,
      ),
    [feeds, colW, rowH, showDiscovery],
  )
  const height = layoutHeight(rects)

  useEffect(() => {
    const timeout = setTimeout(() => setFirstBatchDone(true), 300)
    return () => clearTimeout(timeout)
  }, [])

  return (
    <ScrollView
      style={a.flex_1}
      contentContainerStyle={[a.px_lg, a.pt_md, a.pb_3xl]}
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
              <TilePreview
                feed={feed}
                enabled={index < 4 || firstBatchDone}
              />
            </Pressable>
          )
        })}
        {showDiscovery && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={_(msg`Opens the feed explorer`)}
            onPress={onDiscover}
            style={[
              a.rounded_md,
              a.p_md,
              a.absolute,
              t.atoms.bg_contrast_25,
              {
                left: rects[feeds.length].x,
                top: rects[feeds.length].y,
                width: rects[feeds.length].w - TILE_GAP,
                height: rects[feeds.length].h - TILE_GAP,
              },
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
    </ScrollView>
  )
}

function TilePreview({
  feed,
  enabled,
}: {
  feed: SavedFeedSourceInfo
  enabled: boolean
}) {
  const t = useTheme()
  const query = useFeedPeekQuery(feed.feedDescriptor, enabled)
  if (query.isError) {
    return (
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
        <Trans>Unable to load this feed.</Trans>
      </Text>
    )
  }
  const post = query.data?.[0]
  if (query.isSuccess && !post) {
    return (
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
        <Trans>Quiet feed</Trans>
      </Text>
    )
  }
  return (
    <View style={[a.mt_sm, a.gap_xs]}>
      {post && (
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <UserAvatar type="user" size={20} avatar={post.author.avatar} />
          <Text
            style={[a.text_sm, t.atoms.text_contrast_medium, a.flex_1]}
            numberOfLines={1}>
            {post.author.handle}
          </Text>
        </View>
      )}
      <Text
        style={[a.text_sm, t.atoms.text_contrast_medium]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}>
        {post && 'text' in post.record
          ? String(post.record.text)
          : <Trans>Open feed</Trans>}
      </Text>
    </View>
  )
}
