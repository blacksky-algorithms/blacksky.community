import {type ReactNode} from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, waitFor} from '@testing-library/react-native'

const mockGetSpacePostLikes = jest.fn()
const mockGetSpacePostQuotes = jest.fn()
const mockAgent = {
  getLikes: jest.fn(),
  api: {app: {bsky: {feed: {getQuotes: jest.fn()}}}},
}

jest.mock('#/lib/api/community', () => ({
  getSpacePostLikes: (...args: unknown[]) => mockGetSpacePostLikes(...args),
  getSpacePostQuotes: (...args: unknown[]) => mockGetSpacePostQuotes(...args),
}))
jest.mock('#/state/session', () => ({useAgent: () => mockAgent}))
jest.mock('#/state/queries/profile', () => ({
  useUnstableProfileViewCache: () => ({getUnstableProfile: jest.fn()}),
}))
jest.mock('@lingui/react', () => ({
  useLingui: () => ({_: (value: unknown) => value}),
}))
jest.mock('#/lib/hooks/useInitialNumToRender', () => ({
  useInitialNumToRender: () => 1,
}))
jest.mock('#/lib/hooks/usePostViewTracking', () => ({
  usePostViewTracking: () => jest.fn(),
}))
jest.mock('#/lib/strings/errors', () => ({
  cleanError: (error: unknown) => error,
}))
jest.mock('#/logger', () => ({logger: {error: jest.fn()}}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: () => ({}),
}))
jest.mock('#/view/com/profile/ProfileCard', () => ({
  ProfileCardWithFollowBtn: () => null,
}))
jest.mock('#/view/com/post/Post', () => ({Post: () => null}))
jest.mock('#/view/com/util/List', () => ({List: () => null}))
jest.mock('#/components/Lists', () => ({
  ListFooter: () => null,
  ListMaybePlaceholder: () => null,
}))

import {PostLikedBy} from '../PostLikedBy'
import {PostQuotes} from '../PostQuotes'

const SPACE_POST =
  'at://did:plc:space/space/community.blacksky.feed/test/did:plc:alice/app.bsky.feed.post/3kspace'

function wrapper({children}: {children: ReactNode}) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('permissioned-space post engagement components', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSpacePostLikes.mockImplementation(() => new Promise(() => {}))
    mockGetSpacePostQuotes.mockImplementation(() => new Promise(() => {}))
  })

  it('mounts liked-by and requests the space likes endpoint', async () => {
    expect(() =>
      render(<PostLikedBy uri={SPACE_POST} />, {wrapper}),
    ).not.toThrow()

    await waitFor(() => {
      expect(mockGetSpacePostLikes).toHaveBeenCalledWith(mockAgent, {
        uri: SPACE_POST,
        limit: 30,
        cursor: undefined,
      })
    })
  })

  it('mounts quotes and requests the space quotes endpoint', async () => {
    expect(() =>
      render(<PostQuotes uri={SPACE_POST} />, {wrapper}),
    ).not.toThrow()

    await waitFor(() => {
      expect(mockGetSpacePostQuotes).toHaveBeenCalledWith(mockAgent, {
        uri: SPACE_POST,
        limit: 30,
        cursor: undefined,
      })
    })
  })
})
