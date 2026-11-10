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
  StyleSheet,
} from 'react-native'
import {withSpring} from 'react-native-reanimated'
import {useFocusEffect} from '@react-navigation/native'

import {useBrand} from '#/lib/community/BrandContext'
import {PROD_DEFAULT_FEED} from '#/lib/constants'
import {useNonReactiveCallback} from '#/lib/hooks/useNonReactiveCallback'
import {useOTAUpdates} from '#/lib/hooks/useOTAUpdates'
import {useSetTitle} from '#/lib/hooks/useSetTitle'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {
  type HomeTabNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {isInvalidHandle} from '#/lib/strings/handles'
import {emitSoftReset, listenSoftReset} from '#/state/events'
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
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useSelectedFeed, useSetSelectedFeed} from '#/state/shell/selected-feed'
import {CommunityFeedPage} from '#/view/com/feeds/CommunityFeedPage'
import {FeedPage} from '#/view/com/feeds/FeedPage'
import {HomeHeader, HomeHeaderShell} from '#/view/com/home/HomeHeader'
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
      if (feedInfo.route.name !== 'Home') {
        const params =
          feedInfo.route.params.name &&
          feedInfo.creatorHandle &&
          !isInvalidHandle(feedInfo.creatorHandle)
            ? {...feedInfo.route.params, name: feedInfo.creatorHandle}
            : feedInfo.route.params
        // @ts-ignore dynamic route name, not statically checkable
        navigation.navigate(feedInfo.route.name, params)
        return
      }
      setSelectedFeed(feedInfo.feedDescriptor)
      setFeedOpen(true)
    },
    [navigation, setSelectedFeed],
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
    if (homeView !== 'board') return
    return listenSoftReset(() => {
      if (feedOpen) setFeedOpen(false)
    })
  }, [feedOpen, homeView])

  if (homeView === 'board' && !feedOpen) {
    return (
      <>
        <HomeHeaderShell />
        <Layout.Center style={{flex: 1}}>
          <TileBoard
            feeds={pinnedFeedInfos}
            onSelectFeed={openFeed}
            onSelectVideo={(feed, postUri) => {
              const [descriptorType, feedUri] = feed.feedDescriptor.split('|')
              if (descriptorType !== 'feedgen' || !feedUri) {
                openFeed(feed)
                return
              }
              navigation.navigate('VideoFeed', {
                type: 'feedgen',
                uri: feedUri,
                sourceInterstitial: 'none',
                initialPostUri: postUri,
              })
            }}
            onReorderFeeds={reordered => {
              if (overwriteSavedFeeds.isPending) return
              const byId = new Map(
                preferences.savedFeeds.map(sf => [sf.id, sf]),
              )
              const pinnedInOrder = reordered.flatMap(f => {
                const saved = byId.get(f.savedFeed.id)
                return saved ? [saved] : []
              })
              const unpinned = preferences.savedFeeds.filter(sf => !sf.pinned)
              overwriteSavedFeeds.mutate([...pinnedInOrder, ...unpinned])
            }}
            onUnpinFeed={feed => {
              if (overwriteSavedFeeds.isPending) return
              const target = preferences.savedFeeds.find(
                sf => sf.id === feed.savedFeed.id,
              )
              if (!target) return
              overwriteSavedFeeds.mutate([
                ...preferences.savedFeeds.filter(sf => sf.id !== target.id),
                {...target, pinned: false},
              ])
            }}
            onDiscover={() => navigation.navigate('Feeds')}
            onManageFeeds={() => navigation.navigate('SavedFeeds')}
          />
        </Layout.Center>
      </>
    )
  }

  if (homeView === 'board' && feedOpen) {
    const feedInfo = pinnedFeedInfos[selectedIndex]
    const feed = feedInfo?.feedDescriptor
    return (
      <>
        <Layout.Header.Outer noBottomBorder>
          <Layout.Header.Slot>
            <Layout.Header.BackButton
              onPress={e => {
                e.preventDefault()
                setFeedOpen(false)
              }}
            />
          </Layout.Header.Slot>
          <Layout.Header.Content>
            <Layout.Header.TitleText>
              {feedInfo?.displayName ?? ''}
            </Layout.Header.TitleText>
          </Layout.Header.Content>
          <Layout.Header.Slot />
        </Layout.Header.Outer>
        {feed === 'community' ? (
          <CommunityFeedPage isPageFocused headerOffset={0} />
        ) : feed === 'following' ? (
          <FeedPage
            testID="followingFeedPage"
            isPageFocused
            isPageAdjacent={false}
            feed="following"
            feedParams={homeFeedParams}
            renderEmptyState={renderFollowingEmptyState}
            renderEndOfFeed={FollowingEndOfFeed}
            feedInfo={feedInfo}
          />
        ) : feed ? (
          <FeedPage
            testID="customFeedPage"
            isPageFocused
            isPageAdjacent={false}
            feed={feed}
            savedFeedConfig={feedInfo.savedFeed}
            renderEmptyState={renderCustomFeedEmptyState}
            feedInfo={feedInfo}
          />
        ) : null}
      </>
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
            if (feed === 'community') {
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
})
