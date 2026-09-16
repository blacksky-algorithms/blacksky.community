import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {fireEvent, render, waitFor} from '@testing-library/react-native'

import {type FeedSourceFeedInfo} from '#/state/queries/feed'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences'

const mockOpenComposer = jest.fn()
const mockUseOpenComposer = jest.fn((_feed?: string) => ({
  openComposer: mockOpenComposer,
}))
const mockSetParams = jest.fn()
const mockUseResolveUriQuery = jest.fn()

jest.mock('react-native-reanimated', () => ({
  useAnimatedRef: () => ({current: null}),
}))
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}))
jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (message: {message?: string} | string) =>
      typeof message === 'string' ? message : (message.message ?? ''),
  }),
}))
jest.mock('#/lib/hooks/useOpenComposer', () => ({
  useOpenComposer: (feed?: string) => mockUseOpenComposer(feed),
}))
jest.mock('#/lib/hooks/useSetTitle', () => ({useSetTitle: jest.fn()}))
jest.mock('#/state/events', () => ({listenSoftReset: jest.fn()}))
jest.mock('#/state/feed-feedback', () => ({
  FeedFeedbackProvider: ({children}: React.PropsWithChildren) => children,
  useFeedFeedback: () => ({}),
}))
jest.mock('#/state/queries/feed', () => ({
  useFeedSourceInfoQuery: () => ({data: undefined}),
}))
jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: () => ({data: undefined}),
}))
jest.mock('#/state/queries/post-feed', () => ({
  RQKEY: jest.fn(() => ['post-feed']),
}))
jest.mock('#/state/queries/resolve-uri', () => ({
  useResolveUriQuery: (...args: unknown[]) => mockUseResolveUriQuery(...args),
}))
jest.mock('#/state/session', () => ({
  useSession: () => ({hasSession: true}),
}))
jest.mock('#/view/com/posts/PostFeed', () => ({PostFeed: () => null}))
jest.mock('#/view/com/util/EmptyState', () => ({EmptyState: () => null}))
jest.mock('#/view/com/util/error/ErrorScreen', () => ({
  ErrorScreen: () => null,
}))
jest.mock('#/view/com/util/LoadingPlaceholder', () => ({
  PostFeedLoadingPlaceholder: () => null,
}))
jest.mock('#/view/com/util/load-latest/LoadLatestBtn', () => ({
  LoadLatestBtn: () => null,
}))
jest.mock('#/view/com/util/fab/FAB', () => {
  const {Pressable} = require('react-native')
  return {
    FAB: ({onPress, testID}: {onPress: () => void; testID: string}) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New post"
        accessibilityHint="Opens the composer"
        onPress={onPress}
        testID={testID}
      />
    ),
  }
})
jest.mock('#/screens/Profile/components/ProfileFeedHeader', () => ({
  ProfileFeedHeader: () => null,
  ProfileFeedHeaderSkeleton: () => null,
}))
jest.mock('#/components/Layout', () => {
  const {View} = require('react-native')
  return {
    Screen: ({children}: React.PropsWithChildren) => <View>{children}</View>,
    Content: ({children}: React.PropsWithChildren) => <View>{children}</View>,
  }
})
jest.mock('#/alf', () => ({
  useTheme: () => ({palette: {white: '#fff'}}),
}))

import {ProfileFeedScreen, ProfileFeedScreenInner} from '../index'

const FEED_URI = 'at://did:plc:test/app.bsky.feed.generator/private'
const FEED_DESCRIPTOR = `feedgen|${FEED_URI}` as const
const FEED_INFO = {
  type: 'feed',
  uri: FEED_URI,
  feedDescriptor: FEED_DESCRIPTOR,
  displayName: 'Private Test',
  contentMode: undefined,
} as unknown as FeedSourceFeedInfo

function wrapper({children}: React.PropsWithChildren) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('ProfileFeed composer context', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseResolveUriQuery.mockReturnValue({
      data: {uri: FEED_URI},
      error: undefined,
      refetch: jest.fn(),
      isRefetching: false,
    })
  })

  it('passes the resolved active feed to the ProfileFeed FAB composer', () => {
    const {getByTestId} = render(
      <ProfileFeedScreenInner
        preferences={{} as UsePreferencesQueryResponse}
        feedInfo={FEED_INFO}
        feedParams={undefined}
      />,
      {wrapper},
    )

    expect(mockUseOpenComposer).toHaveBeenCalledWith(FEED_DESCRIPTOR)
    fireEvent.press(getByTestId('composeFAB'))
    expect(mockOpenComposer).toHaveBeenCalledWith({logContext: 'Fab'})
  })

  it('publishes the resolved descriptor for the desktop sidebar composer', async () => {
    const props = {
      route: {
        params: {name: 'did:plc:test', rkey: 'private'},
      },
      navigation: {setParams: mockSetParams},
    } as unknown as React.ComponentProps<typeof ProfileFeedScreen>

    render(<ProfileFeedScreen {...props} />, {wrapper})

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({
        resolvedFeed: FEED_DESCRIPTOR,
      })
    })
  })
})
