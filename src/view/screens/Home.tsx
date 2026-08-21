import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
} from 'react-native'
import {withSpring} from 'react-native-reanimated'
import {TID} from '@atproto/common-web'
import {Trans} from '@lingui/react/macro'
import {useFocusEffect} from '@react-navigation/native'

import {useBrand} from '#/lib/community/BrandContext'
import {COMMUNITY_FEED_URI, PROD_DEFAULT_FEED} from '#/lib/constants'
import {useNonReactiveCallback} from '#/lib/hooks/useNonReactiveCallback'
import {useOTAUpdates} from '#/lib/hooks/useOTAUpdates'
import {useSetTitle} from '#/lib/hooks/useSetTitle'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {
  type HomeTabNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {emitSoftReset, listenSoftReset} from '#/state/events'
import {useCommunityMembership} from '#/state/queries/community-membership'
import {
  type SavedFeedSourceInfo,
  usePinnedFeedsInfos,
} from '#/state/queries/feed'
import {type FeedDescriptor, type FeedParams} from '#/state/queries/post-feed'
import {
  useOverwriteSavedFeedsMutation,
  usePreferencesQuery,
} from '#/state/queries/preferences'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {useSession} from '#/state/session'
import {useHomeView} from '#/state/shell'
import * as persisted from '#/state/persisted'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useSelectedFeed, useSetSelectedFeed} from '#/state/shell/selected-feed'
import {CommunityFeedPage} from '#/view/com/feeds/CommunityFeedPage'
import {FeedPage} from '#/view/com/feeds/FeedPage'
import {HomeHeader} from '#/view/com/home/HomeHeader'
import {TileBoard} from '#/view/com/home/TileBoard'
import {
  Pager,
  type PagerRef,
  type RenderTabBarFnProps,
} from '#/view/com/pager/Pager'
import {CustomFeedEmptyState} from '#/view/com/posts/CustomFeedEmptyState'
import {FollowingEmptyState} from '#/view/com/posts/FollowingEmptyState'
import {FollowingEndOfFeed} from '#/view/com/posts/FollowingEndOfFeed'
import {
  HomeHeaderModeProvider,
  useHomeHeaderMode,
} from '#/view/com/util/MainScrollProvider'
import {NoFeedsPinned} from '#/screens/Home/NoFeedsPinned'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_LIQUID_GLASS, IS_WEB} from '#/env'
import {useDemoMode} from '#/storage/hooks/demo-mode'

type Props = NativeStackScreenProps<HomeTabNavigatorParams, 'Home' | 'Start'>
export function HomeScreen(props: Props) {
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const {data: preferences} = usePreferencesQuery()
  const {currentAccount} = useSession()
  const {data: pinnedFeedInfos, isLoading: isPinnedFeedsLoading} =
    usePinnedFeedsInfos()

  useEffect(() => {
    if (IS_WEB && !currentAccount) {
      const getParams = new URLSearchParams(window.location.search)
      const splash = getParams.get('splash')
      if (splash === 'true') {
        setShowLoggedOut(true)
        return
      }
    }

    const params = props.route.params
    if (
      currentAccount &&
      props.route.name === 'Start' &&
      params?.name &&
      params?.rkey
    ) {
      props.navigation.navigate('StarterPack', {
        rkey: params.rkey,
        name: params.name,
      })
    }
  }, [
    currentAccount,
    props.navigation,
    props.route.name,
    props.route.params,
    setShowLoggedOut,
  ])

  if (preferences && pinnedFeedInfos && !isPinnedFeedsLoading) {
    return (
      <Layout.Screen testID="HomeScreen" noInsetTop={IS_LIQUID_GLASS}>
        <HomeHeaderModeProvider>
          <HomeScreenReady
            {...props}
            preferences={preferences}
            pinnedFeedInfos={pinnedFeedInfos}
          />
        </HomeHeaderModeProvider>
      </Layout.Screen>
    )
  } else {
    return (
      <Layout.Screen>
        <Layout.Center style={styles.loading}>
          <ActivityIndicator size="large" />
        </Layout.Center>
      </Layout.Screen>
    )
  }
}

function HomeScreenReady({
  preferences,
  pinnedFeedInfos,
  navigation,
}: Props & {
  preferences: UsePreferencesQueryResponse
  pinnedFeedInfos: SavedFeedSourceInfo[]
}) {
  const ax = useAnalytics()
  const homeView = useHomeView()
  const [feedOpen, setFeedOpen] = useState(false)
  const [communityFeedMigrated, setCommunityFeedMigrated] = useState(
    () => persisted.get('communityFeedMigrated') ?? false,
  )
  const {data: isCommunityMember = false} = useCommunityMembership()
  const overwriteSavedFeeds = useOverwriteSavedFeedsMutation()
  const brand = useBrand()
  const allFeeds = useMemo(
    () => pinnedFeedInfos.map(f => f.feedDescriptor),
    [pinnedFeedInfos],
  )
  const maybeRawSelectedFeed: FeedDescriptor | undefined =
    useSelectedFeed() ?? allFeeds[0]
  const setSelectedFeed = useSetSelectedFeed()
  const maybeFoundIndex = allFeeds.indexOf(maybeRawSelectedFeed)
  const selectedIndex = Math.max(0, maybeFoundIndex)
  const maybeSelectedFeed: FeedDescriptor | undefined = allFeeds[selectedIndex]
  const requestNotificationsPermission = useRequestNotificationsPermission()

  useSetTitle(pinnedFeedInfos[selectedIndex]?.displayName)
  useOTAUpdates()

  useEffect(() => {
    requestNotificationsPermission('Home')
  }, [requestNotificationsPermission])

  useEffect(() => {
    if (
      !COMMUNITY_FEED_URI ||
      !isCommunityMember ||
      communityFeedMigrated ||
      overwriteSavedFeeds.isPending ||
      preferences.savedFeeds.some(feed => feed.value === COMMUNITY_FEED_URI)
    ) {
      return
    }
    const savedFeeds = [...preferences.savedFeeds]
    savedFeeds.splice(Math.min(1, savedFeeds.length), 0, {
      id: TID.nextStr(),
      type: 'feed',
      value: COMMUNITY_FEED_URI,
      pinned: true,
    })
    overwriteSavedFeeds.mutate(savedFeeds, {
      onSuccess: () => {
        setCommunityFeedMigrated(true)
        void persisted.write('communityFeedMigrated', true)
      },
    })
  }, [
    communityFeedMigrated,
    isCommunityMember,
    overwriteSavedFeeds,
    preferences.savedFeeds,
  ])

  const pagerRef = useRef<PagerRef>(null)
  const lastPagerReportedIndexRef = useRef(selectedIndex)
  useLayoutEffect(() => {
    // Since the pager is not a controlled component, adjust it imperatively
    // if the selected index gets out of sync with what it last reported.
    // This is supposed to only happen on the web when you use the right nav.
    if (selectedIndex !== lastPagerReportedIndexRef.current) {
      lastPagerReportedIndexRef.current = selectedIndex
      pagerRef.current?.setPage(selectedIndex)
    }
  }, [selectedIndex])

  const {hasSession} = useSession()
  const headerMode = useHomeHeaderMode()
  const showHeader = useCallback(() => {
    'worklet'
    headerMode.set(() => withSpring(0, {overshootClamping: true}))
  }, [headerMode])

  useFocusEffect(
    useCallback(() => {
      return () => showHeader()
    }, [showHeader]),
  )

  useFocusEffect(
    useNonReactiveCallback(() => {
      if (maybeSelectedFeed) {
        ax.metric('home:feedDisplayed', {
          index: selectedIndex,
          feedType: maybeSelectedFeed.split('|')[0],
          feedUrl: maybeSelectedFeed,
          reason: 'focus',
        })
      }
    }),
  )

  const onPageSelected = useCallback(
    (index: number) => {
      showHeader()
      const maybeFeed = allFeeds[index]

      // Mutate the ref before setting state to avoid the imperative syncing effect
      // above from starting a loop on Android when swiping back and forth.
      lastPagerReportedIndexRef.current = index
      setSelectedFeed(maybeFeed)

      if (maybeFeed) {
        ax.metric('home:feedDisplayed', {
          index,
          feedType: maybeFeed.split('|')[0],
          feedUrl: maybeFeed,
        })
      }
    },
    [ax, setSelectedFeed, showHeader, allFeeds],
  )

  const onPressSelected = useCallback(() => {
    emitSoftReset()
  }, [])

  const onPageScrollStateChanged = useCallback(
    (state: 'idle' | 'dragging' | 'settling') => {
      'worklet'
      if (state === 'dragging') {
        showHeader()
      }
    },
    [showHeader],
  )

  const [demoMode] = useDemoMode()

  const renderTabBar = useCallback(
    (props: RenderTabBarFnProps) => {
      if (demoMode) {
        return (
          <HomeHeader
            key="FEEDS_TAB_BAR"
            {...props}
            testID="homeScreenFeedTabs"
            onPressSelected={onPressSelected}
            feeds={[
              {displayName: 'Following', uri: 'following'},
              {displayName: brand.metadata.displayName, uri: 'demo'},
            ]}
          />
        )
      }
      return (
        <HomeHeader
          key="FEEDS_TAB_BAR"
          {...props}
          testID="homeScreenFeedTabs"
          onPressSelected={onPressSelected}
          feeds={pinnedFeedInfos}
        />
      )
    },
    [onPressSelected, pinnedFeedInfos, demoMode, brand.metadata.displayName],
  )

  const renderFollowingEmptyState = useCallback(() => {
    return <FollowingEmptyState />
  }, [])

  const renderCustomFeedEmptyState = useCallback(() => {
    return <CustomFeedEmptyState />
  }, [])

  const homeFeedParams = useMemo<FeedParams>(() => {
    return {
      mergeFeedEnabled: Boolean(preferences.feedViewPrefs.lab_mergeFeedEnabled),
      mergeFeedSources: preferences.feedViewPrefs.lab_mergeFeedEnabled
        ? preferences.savedFeeds
            .filter(f => f.type === 'feed' || f.type === 'list')
            .map(f => f.value)
        : [],
    }
  }, [preferences])

  const openFeed = useCallback(
    (feedInfo: SavedFeedSourceInfo) => {
      setSelectedFeed(feedInfo.feedDescriptor)
      setFeedOpen(true)
    },
    [setSelectedFeed],
  )

  useEffect(() => {
    if (IS_WEB || homeView !== 'board' || !feedOpen) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setFeedOpen(false)
        return true
      },
    )
    return () => subscription.remove()
  }, [feedOpen, homeView])

  useEffect(() => {
    if (IS_WEB || homeView !== 'board') return
    return listenSoftReset(() => {
      if (feedOpen) setFeedOpen(false)
    })
  }, [feedOpen, homeView])

  if (!IS_WEB && homeView === 'board' && !feedOpen) {
    return (
      <TileBoard
        feeds={pinnedFeedInfos}
        onSelectFeed={openFeed}
        onDiscover={() => navigation.navigate('Feeds')}
      />
    )
  }

  if (demoMode) {
    return (
      <Pager
        ref={pagerRef}
        testID="homeScreen"
        onPageSelected={onPageSelected}
        renderTabBar={renderTabBar}
        initialPage={selectedIndex}>
        <FeedPage
          testID="demoFeedPage"
          isPageFocused
          isPageAdjacent={false}
          feed="demo"
          renderEmptyState={renderCustomFeedEmptyState}
          feedInfo={pinnedFeedInfos[0]}
        />
        <FeedPage
          testID="customFeedPage"
          isPageFocused
          isPageAdjacent={false}
          feed={`feedgen|${PROD_DEFAULT_FEED('blacksky-trend')}`}
          renderEmptyState={renderCustomFeedEmptyState}
          feedInfo={pinnedFeedInfos[0]}
        />
      </Pager>
    )
  }

  return hasSession ? (
    <>
      {!IS_WEB && homeView === 'board' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFeedOpen(false)}
          style={styles.backToTiles}>
          <Text>
            <Trans>Back to tiles</Trans>
          </Text>
        </Pressable>
      )}
      <Pager
        key={allFeeds.join(',')}
        ref={pagerRef}
        testID="homeScreen"
        initialPage={selectedIndex}
        onPageSelected={onPageSelected}
        onPageScrollStateChanged={onPageScrollStateChanged}
        renderTabBar={renderTabBar}>
        {pinnedFeedInfos.length ? (
          pinnedFeedInfos.map((feedInfo, index) => {
            const feed = feedInfo.feedDescriptor
            if (feed === 'following') {
              return (
                <FeedPage
                  key={feed}
                  testID="followingFeedPage"
                  isPageFocused={maybeSelectedFeed === feed}
                  isPageAdjacent={Math.abs(selectedIndex - index) === 1}
                  feed={feed}
                  feedParams={homeFeedParams}
                  renderEmptyState={renderFollowingEmptyState}
                  renderEndOfFeed={FollowingEndOfFeed}
                  feedInfo={feedInfo}
                />
              )
            }
          if (feed === 'community' && !COMMUNITY_FEED_URI) {
              return (
                <CommunityFeedPage
                  key={feed}
                  isPageFocused={maybeSelectedFeed === feed}
                />
              )
            }
            const savedFeedConfig = feedInfo.savedFeed
            return (
              <FeedPage
                key={feed}
                testID="customFeedPage"
                isPageFocused={maybeSelectedFeed === feed}
                isPageAdjacent={Math.abs(selectedIndex - index) === 1}
                feed={feed}
                renderEmptyState={renderCustomFeedEmptyState}
                savedFeedConfig={savedFeedConfig}
                feedInfo={feedInfo}
              />
            )
          })
        ) : (
          <NoFeedsPinned preferences={preferences} />
        )}
      </Pager>
    </>
  ) : (
    <Pager
      testID="homeScreen"
      onPageSelected={onPageSelected}
      onPageScrollStateChanged={onPageScrollStateChanged}
      renderTabBar={renderTabBar}>
      {pinnedFeedInfos.length > 0 ? (
        pinnedFeedInfos.map((feedInfo, index) => (
          <FeedPage
            key={feedInfo.feedDescriptor}
            testID="customFeedPage"
            isPageFocused={selectedIndex === index}
            isPageAdjacent={Math.abs(selectedIndex - index) === 1}
            feed={feedInfo.feedDescriptor}
            renderEmptyState={renderCustomFeedEmptyState}
            feedInfo={feedInfo}
          />
        ))
      ) : (
        <FeedPage
          testID="customFeedPage"
          isPageFocused
          isPageAdjacent={false}
          feed={`feedgen|${PROD_DEFAULT_FEED('blacksky-trend')}`}
          renderEmptyState={renderCustomFeedEmptyState}
          feedInfo={pinnedFeedInfos[0]}
        />
      )}
    </Pager>
  )
}

const styles = StyleSheet.create({
  loading: {
    height: '100%',
    alignContent: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  backToTiles: {
    alignSelf: 'center',
    marginVertical: 8,
  },
})
