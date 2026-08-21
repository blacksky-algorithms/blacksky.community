import {useEffect, useMemo, useState} from 'react'
import {
  BackHandler,
  PixelRatio,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedRef,
  useScrollViewOffset,
} from 'react-native-reanimated'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {type SavedFeedSourceInfo} from '#/state/queries/feed'
import {useFeedPeekQuery} from '#/state/queries/feed-peek'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {SortableGrid} from '#/components/SortableGrid'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {deriveTileSpan, layoutHeight, packLayout} from './layout'

const TILE_GAP = 8
const TILE_HEIGHT = 160

export function TileBoard({
  feeds,
  onSelectFeed,
  onReorderFeeds,
  onUnpinFeed,
  onDiscover,
  onManageFeeds,
}: {
  feeds: SavedFeedSourceInfo[]
  onSelectFeed: (feed: SavedFeedSourceInfo) => void
  onReorderFeeds: (feeds: SavedFeedSourceInfo[]) => void
  onUnpinFeed: (feed: SavedFeedSourceInfo) => void
  onDiscover: () => void
  onManageFeeds: () => void
}) {
  const {width} = useWindowDimensions()
  const {_} = useLingui()
  const t = useTheme()
  const [boardWidth, setBoardWidth] = useState(width)
  const [firstBatchDone, setFirstBatchDone] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffset = useScrollViewOffset(scrollRef)

  const colW = (boardWidth - TILE_GAP) / 2
  const rowH = TILE_HEIGHT * PixelRatio.getFontScale()
  const showDiscovery = feeds.length < 3 && !isEditing
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

  useEffect(() => {
    if (IS_WEB || !isEditing) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsEditing(false)
      return true
    })
    return () => subscription.remove()
  }, [isEditing])

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={a.flex_1}
      scrollEnabled={!isDragging}
      contentContainerStyle={[a.px_lg, a.pt_md, a.pb_3xl]}
      onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
      {isEditing && (
        <View style={[a.flex_row, a.justify_between, a.align_center, a.pb_md]}>
          <Pressable
            accessibilityRole="button"
            onPress={onManageFeeds}
            style={[a.rounded_full, a.px_md, a.py_sm, t.atoms.bg_contrast_25]}>
            <Text style={[a.text_sm, a.font_bold]}>
              <Trans>Add a tile</Trans>
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsEditing(false)}
            style={[a.rounded_full, a.px_md, a.py_sm, t.atoms.bg_contrast_25]}>
            <Text style={[a.text_sm, a.font_bold, {color: t.palette.primary_500}]}>
              <Trans>Done</Trans>
            </Text>
          </Pressable>
        </View>
      )}
      <View style={{height}}>
        <SortableGrid
          data={feeds}
          keyExtractor={feed => feed.savedFeed.id}
          spanExtractor={(feed, index) => deriveTileSpan(index, feed)}
          editable={isEditing}
          colW={colW + TILE_GAP}
          rowH={rowH + TILE_GAP}
          scrollRef={scrollRef}
          scrollOffset={scrollOffset}
          onReorder={onReorderFeeds}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
          renderItem={feed => (
            <Tile
              feed={feed}
              isEditing={isEditing}
              enabled={
                feeds.findIndex(f => f.savedFeed.id === feed.savedFeed.id) < 4 ||
                firstBatchDone
              }
              onPress={() => {
                if (!isEditing) onSelectFeed(feed)
              }}
              onLongPress={() => setIsEditing(true)}
              onUnpin={() => onUnpinFeed(feed)}
            />
          )}
        />
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
    </Animated.ScrollView>
  )
}

function Tile({
  feed,
  isEditing,
  enabled,
  onPress,
  onLongPress,
  onUnpin,
}: {
  feed: SavedFeedSourceInfo
  isEditing: boolean
  enabled: boolean
  onPress: () => void
  onLongPress: () => void
  onUnpin: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={feed.displayName}
      accessibilityHint={
        isEditing ? _(msg`Hold and drag to reorder`) : _(msg`Opens this feed`)
      }
      onPress={onPress}
      onLongPress={isEditing ? undefined : onLongPress}
      disabled={isEditing}
      style={[
        a.flex_1,
        a.rounded_md,
        a.p_md,
        t.atoms.bg_contrast_25,
        {marginRight: TILE_GAP, marginBottom: TILE_GAP},
      ]}>
      <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
        {feed.displayName}
      </Text>
      <TilePreview feed={feed} enabled={enabled} />
      {isEditing && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Unpin ${feed.displayName}`)}
          accessibilityHint={_(msg`Removes this feed from your home`)}
          onPress={onUnpin}
          hitSlop={8}
          style={[
            a.absolute,
            a.rounded_full,
            a.align_center,
            a.justify_center,
            t.atoms.bg_contrast_100,
            {top: 6, right: 6, width: 22, height: 22},
          ]}>
          <Text style={[a.text_sm, a.font_bold]}>–</Text>
        </Pressable>
      )}
    </Pressable>
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
        {post && 'text' in post.record ? (
          String(post.record.text)
        ) : (
          <Trans>Open feed</Trans>
        )}
      </Text>
    </View>
  )
}
