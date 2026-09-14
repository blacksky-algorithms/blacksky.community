import {Pressable} from 'react-native'
import {fireEvent, render, waitFor} from '@testing-library/react-native'

import {type FeedDescriptor} from '#/state/queries/post-feed'

const mockRootOpenComposer = jest.fn()
const mockUseCommunityPostTargets = jest.fn()

jest.mock('#/lib/hooks/useRequireEmailVerification', () => ({
  useRequireEmailVerification:
    () =>
    (callback: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      callback(...args),
}))
jest.mock('#/state/shell/composer', () => ({
  useOpenComposer: () => ({openComposer: mockRootOpenComposer}),
}))
jest.mock('#/state/queries/community-post-targets', () => ({
  useCommunityPostTargets: (feed?: unknown) =>
    mockUseCommunityPostTargets(feed),
}))
jest.mock('@lingui/react', () => ({Trans: () => null}))

import {useOpenComposer} from '../useOpenComposer'

const FEED_URI = 'at://did:plc:test/app.bsky.feed.generator/private'
const FEED_DESCRIPTOR = `feedgen|${FEED_URI}` as FeedDescriptor
const PRIVATE_TARGET = {
  feed: FEED_URI,
  name: 'Private Test',
  serviceDid: 'did:web:feeds.test',
  config: {
    $type: 'community.blacksky.feed.config',
    contentType: 'communityRecord',
    visibility: 'gated',
    space: 'at://did:plc:test/space/community.blacksky.feed/private',
    group: 'members',
    createdAt: '2026-08-29T00:00:00.000Z',
  },
}
function OpenComposerHarness({
  opts = {},
  contextualFeed,
}: {
  opts?: Record<string, unknown>
  contextualFeed?: FeedDescriptor
}) {
  const {openComposer} = useOpenComposer(contextualFeed)
  return (
    <Pressable
      accessibilityLabel="Open composer"
      accessibilityHint="Opens the composer"
      onPress={() => {
        void openComposer(opts)
      }}
    />
  )
}

describe('useOpenComposer selected feed context', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseCommunityPostTargets.mockReturnValue({data: [PRIVATE_TARGET]})
  })

  it('captures the active private Home feed for shared FAB/sidebar entry points', async () => {
    const {getByLabelText} = render(
      <OpenComposerHarness contextualFeed={FEED_DESCRIPTOR} />,
    )

    fireEvent.press(getByLabelText('Open composer'))

    await waitFor(() => {
      expect(mockUseCommunityPostTargets).toHaveBeenCalledWith(FEED_DESCRIPTOR)
      expect(mockRootOpenComposer).toHaveBeenCalledWith({
        contextualCommunityFeedTarget: PRIVATE_TARGET,
      })
    })
  })

  it('opens from the global keyboard shortcut path outside a navigator', async () => {
    const {getByLabelText} = render(<OpenComposerHarness />)

    fireEvent.press(getByLabelText('Open composer'))

    await waitFor(() => {
      expect(mockUseCommunityPostTargets).toHaveBeenCalledWith(undefined)
      expect(mockRootOpenComposer).toHaveBeenCalledWith({})
    })
  })

  it('waits for the authoritative target lookup before opening', async () => {
    const refetch = jest.fn().mockResolvedValue({data: [PRIVATE_TARGET]})
    mockUseCommunityPostTargets.mockReturnValue({data: undefined, refetch})
    const {getByLabelText} = render(
      <OpenComposerHarness contextualFeed={FEED_DESCRIPTOR} />,
    )

    fireEvent.press(getByLabelText('Open composer'))

    await waitFor(() => {
      expect(refetch).toHaveBeenCalled()
      expect(mockRootOpenComposer).toHaveBeenCalledWith({
        contextualCommunityFeedTarget: PRIVATE_TARGET,
      })
    })
  })

  it('does not capture a selected feed without a permissioned space', async () => {
    mockUseCommunityPostTargets.mockReturnValue({
      data: [
        {
          ...PRIVATE_TARGET,
          config: {...PRIVATE_TARGET.config, space: undefined},
        },
      ],
    })
    const {getByLabelText} = render(
      <OpenComposerHarness contextualFeed={FEED_DESCRIPTOR} />,
    )

    fireEvent.press(getByLabelText('Open composer'))

    await waitFor(() => {
      expect(mockRootOpenComposer).toHaveBeenCalledWith({})
    })
  })

  it.each([
    ['a reply', {replyTo: {uri: 'at://did:plc:test/post/1'}}],
    ['a quote', {quote: {uri: 'at://did:plc:test/post/1'}}],
  ])('does not leak selected-feed context into %s', async (_, opts) => {
    const {getByLabelText} = render(
      <OpenComposerHarness opts={opts} contextualFeed={FEED_DESCRIPTOR} />,
    )

    fireEvent.press(getByLabelText('Open composer'))

    await waitFor(() => {
      expect(mockRootOpenComposer).toHaveBeenCalledWith(opts)
    })
  })
})
