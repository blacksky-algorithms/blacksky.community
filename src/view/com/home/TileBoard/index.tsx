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
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {AppBskyEmbedVideo, AppBskyFeedDefs} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {type SavedFeedSourceInfo} from '#/state/queries/feed'
import {useFeedPeekQuery} from '#/state/queries/feed-peek'
import {useShellLayout} from '#/state/shell/shell-layout'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import * as Layout from '#/components/Layout'
import {SortableGrid} from '#/components/SortableGrid'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {deriveTileSpan, layoutHeight, packLayout} from './layout'
import {Gloss, Sheen, Twinkles} from './Sheen'
import {type TileTint, tintForFeed} from './tint'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const TILE_GAP = 8
const TILE_HEIGHT = 160
const TILE_RADIUS = 28

export function TileBoard({
  feeds,
  onSelectFeed,
  onSelectVideo,
  onReorderFeeds,
  onUnpinFeed,
  onDiscover,
  onManageFeeds,
}: {
  feeds: SavedFeedSourceInfo[]
  onSelectFeed: (feed: SavedFeedSourceInfo) => void
  onSelectVideo: (feed: SavedFeedSourceInfo, postUri: string) => void
  onReorderFeeds: (feeds: SavedFeedSourceInfo[]) => void
  onUnpinFeed: (feed: SavedFeedSourceInfo) => void
  onDiscover: () => void
  onManageFeeds: () => void
}) {
  const {width} = useWindowDimensions()
  const {_} = useLingui()
  const t = useTheme()
  const [boardWidth, setBoardWidth] = useState(() =>
    Math.min(width - 32, Layout.CENTER_COLUMN_WIDTH - 32),
  )
  const [firstBatchDone, setFirstBatchDone] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffset = useScrollViewOffset(scrollRef)
  const {footerHeight} = useShellLayout()
  const footerOffset = useAnimatedStyle(() => ({
    marginBottom: footerHeight.get(),
  }))

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
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setIsEditing(false)
        return true
      },
    )
    return () => subscription.remove()
  }, [isEditing])

  return (
    <View style={a.flex_1}>
      <Animated.ScrollView
        ref={scrollRef}
        style={[a.flex_1, footerOffset]}
        scrollEnabled={!isDragging}
        contentContainerStyle={[a.pt_md, a.pb_3xl]}>
        <View style={[a.px_lg, a.w_full]}>
          <View
            style={a.w_full}
            onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}
          />
          {IS_WEB && !isEditing && (
            <View style={[a.flex_row, a.justify_end, a.pb_md]}>
              <Pressable
                accessibilityRole="button"
                onPress={onManageFeeds}
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  t.atoms.bg_contrast_25,
                ]}>
                <Text style={[a.text_sm, a.font_bold]}>
                  <Trans>Edit</Trans>
                </Text>
              </Pressable>
            </View>
          )}
          {isEditing && (
            <View
              style={[a.flex_row, a.justify_between, a.align_center, a.pb_md]}>
              <Pressable
                accessibilityRole="button"
                onPress={onManageFeeds}
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  t.atoms.bg_contrast_25,
                ]}>
                <Text style={[a.text_sm, a.font_bold]}>
                  <Trans>Add a tile</Trans>
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsEditing(false)}
                style={[
                  a.rounded_full,
                  a.px_md,
                  a.py_sm,
                  t.atoms.bg_contrast_25,
                ]}>
                <Text
                  style={[
                    a.text_sm,
                    a.font_bold,
                    {color: t.palette.primary_500},
                  ]}>
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
              renderItem={(feed, index) => (
                <Tile
                  feed={feed}
                  index={index}
                  tileWidth={
                    deriveTileSpan(index, feed) === 2 ? boardWidth : colW
                  }
                  isHero={index === 0}
                  isEditing={isEditing}
                  enabled={
                    feeds.findIndex(f => f.savedFeed.id === feed.savedFeed.id) <
                      4 || firstBatchDone
                  }
                  onPress={() => {
                    if (!isEditing) onSelectFeed(feed)
                  }}
                  onPressVideo={postUri => {
                    if (!isEditing) onSelectVideo(feed, postUri)
                  }}
                  onLongPress={() => {
                    if (!IS_WEB) setIsEditing(true)
                  }}
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
                  a.p_md,
                  a.absolute,
                  a.border,
                  t.atoms.bg_contrast_25,
                  t.atoms.border_contrast_medium,
                  {
                    borderRadius: TILE_RADIUS,
                    borderStyle: 'dashed',
                    left: rects[feeds.length].x,
                    top: rects[feeds.length].y,
                    width: rects[feeds.length].w - TILE_GAP,
                    height: rects[feeds.length].h - TILE_GAP,
                  },
                ]}>
                <Text style={[a.text_md, a.font_bold]}>
                  <Trans>Find feeds</Trans>
                </Text>
                <Text
                  style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
                  <Trans>Explore more feeds to pin here.</Trans>
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  )
}

function Tile({
  feed,
  index,
  tileWidth,
  isHero,
  isEditing,
  enabled,
  onPress,
  onPressVideo,
  onLongPress,
  onUnpin,
}: {
  feed: SavedFeedSourceInfo
  index: number
  tileWidth: number
  isHero: boolean
  isEditing: boolean
  enabled: boolean
  onPress: () => void
  onPressVideo: (postUri: string) => void
  onLongPress: () => void
  onUnpin: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const tint = tintForFeed(feed.uri || feed.feedDescriptor, t.scheme === 'dark')
  const isDark = t.scheme === 'dark'
  const press = useSharedValue(0)
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{scale: 1 - press.get() * 0.035}],
  }))
  return (
    <AnimatedPressable
      onPressIn={() => {
        press.set(withSpring(1, {mass: 0.4, damping: 14}))
      }}
      onPressOut={() => {
        press.set(withSpring(0, {mass: 0.4, damping: 14}))
      }}
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
        a.overflow_hidden,
        {
          borderRadius: TILE_RADIUS,
          marginRight: TILE_GAP,
          marginBottom: TILE_GAP,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 6},
          shadowOpacity: t.scheme === 'dark' ? 0.4 : 0.12,
          shadowRadius: 14,
          elevation: 4,
        },
        pressStyle,
      ]}>
      <LinearGradient
        colors={[tint.from, tint.to]}
        start={{x: 0.1, y: 0}}
        end={{x: 0.9, y: 1}}
        style={[a.absolute, a.inset_0]}
      />
      <Gloss isDark={isDark} />
      <View
        style={[
          a.absolute,
          {
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: isDark
              ? 'rgba(255,255,255,0.10)'
              : 'rgba(255,255,255,0.65)',
          },
        ]}
      />
      {isHero && <Twinkles isDark={isDark} />}
      <Sheen index={index} width={tileWidth} isDark={isDark} />
      <View style={[a.flex_1, a.p_md]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          {feed.avatar && (
            <UserAvatar type="algo" size={22} avatar={feed.avatar} />
          )}
          <Text
            style={[a.text_md, a.font_bold, a.flex_1, {color: tint.title}]}
            numberOfLines={1}>
            {feed.displayName}
          </Text>
          {!isEditing && (
            <ChevronRightIcon size="xs" style={{color: tint.body}} />
          )}
        </View>
        <TilePreview
          feed={feed}
          isHero={isHero}
          tint={tint}
          isDark={isDark}
          enabled={enabled}
          isEditing={isEditing}
          onPressVideo={onPressVideo}
        />
      </View>
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
    </AnimatedPressable>
  )
}

function TilePreview({
  feed,
  isHero,
  tint,
  isDark,
  enabled,
  isEditing,
  onPressVideo,
}: {
  feed: SavedFeedSourceInfo
  isHero: boolean
  tint: TileTint
  isDark: boolean
  enabled: boolean
  isEditing: boolean
  onPressVideo: (postUri: string) => void
}) {
  const query = useFeedPeekQuery(feed.feedDescriptor, enabled)
  if (query.isError) {
    return (
      <Text
        style={[a.text_sm, a.mt_sm, {color: tint.body}]}
        numberOfLines={1}>
        <Trans>Unable to load this feed.</Trans>
      </Text>
    )
  }
  const post = query.data?.[0]
  if (!post) {
    if (!query.isSuccess) {
      return null
    }
    return (
      <Text
        style={[a.text_sm, a.mt_sm, {color: tint.body}]}
        numberOfLines={1}>
        <Trans>Quiet feed</Trans>
      </Text>
    )
  }
  if (feed.contentMode === AppBskyFeedDefs.CONTENTMODEVIDEO) {
    const videoPosts = (query.data ?? []).filter(p =>
      AppBskyEmbedVideo.isView(p.embed),
    )
    if (videoPosts.length > 0) {
      return (
        <VideoTilePreview
          posts={videoPosts}
          isEditing={isEditing}
          onPressVideo={onPressVideo}
        />
      )
    }
  }
  if (!isHero) {
    const authors = Array.from(
      new Map(
        (query.data ?? []).map(item => [item.author.did, item.author]),
      ).values(),
    ).slice(0, 3)
    const description = feed.description?.text?.trim()
    return (
      <>
        {description ? (
          <Text
            style={[a.text_xs, a.leading_snug, a.mt_2xs, {color: tint.body}]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}>
            {description}
          </Text>
        ) : null}
        <View style={[a.flex_row, a.align_end, a.flex_1, a.pb_xs, a.mt_sm]}>
        {authors.map((author, index) => (
          <View
            key={author.did}
            style={[
              a.relative,
              {
                left: index * -10,
                zIndex: authors.length - index,
                borderWidth: 2.5,
                borderColor: tint.ring,
                borderRadius: 999,
              },
            ]}>
            <UserAvatar type="user" size={44} avatar={author.avatar} />
          </View>
        ))}
          {authors.length > 0 && (
            <View
              style={[
                a.relative,
                a.align_center,
                a.justify_center,
                {
                  left: authors.length * -10,
                  zIndex: 0,
                  width: 44,
                  height: 44,
                  borderWidth: 2.5,
                  borderColor: tint.ring,
                  borderRadius: 999,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(0,0,0,0.06)',
                },
              ]}>
              <Text
                style={[a.text_lg, {color: tint.body, lineHeight: 20}]}
                maxFontSizeMultiplier={1.2}>
                +
              </Text>
            </View>
          )}
        </View>
      </>
    )
  }
  return (
    <View style={a.mt_sm}>
      <View style={[a.flex_row, a.gap_sm]}>
        <UserAvatar type="user" size={20} avatar={post.author.avatar} />
        <View style={a.flex_1}>
          <Text
            style={[
              a.text_xs,
              a.font_bold,
              a.mb_2xs,
              {color: tint.body},
            ]}
            numberOfLines={1}>
            {post.author.handle}
          </Text>
          <Text
            style={[a.text_sm, a.leading_snug, {color: tint.title}]}
            numberOfLines={3}
            maxFontSizeMultiplier={1.3}>
            {'text' in post.record ? (
              String(post.record.text)
            ) : (
              <Trans>Open feed</Trans>
            )}
          </Text>
        </View>
      </View>
    </View>
  )
}

function VideoTilePreview({
  posts,
  isEditing,
  onPressVideo,
}: {
  posts: AppBskyFeedDefs.PostView[]
  isEditing: boolean
  onPressVideo: (postUri: string) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  return (
    <View
      style={[
        a.flex_row,
        a.gap_sm,
        a.mt_sm,
        a.pt_sm,
        a.flex_1,
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      {posts.slice(0, 2).map(post => {
        const embed = post.embed
        if (!AppBskyEmbedVideo.isView(embed)) return null
        return (
          <Pressable
            key={post.uri}
            accessibilityRole="button"
            accessibilityLabel={_(msg`Video by ${post.author.handle}`)}
            accessibilityHint={_(msg`Opens this video`)}
            disabled={isEditing}
            onPress={() => onPressVideo(post.uri)}
            style={[
              a.flex_1,
              a.rounded_sm,
              a.overflow_hidden,
              t.atoms.bg_contrast_100,
            ]}>
            <Image
              source={{uri: embed.thumbnail}}
              style={[a.flex_1]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        )
      })}
    </View>
  )
}
