import {type BskyAgent} from '@atproto/api'

const mockGetSpacePostLikes = jest.fn()
const mockGetSpacePostQuotes = jest.fn()

jest.mock('#/lib/api/community', () => ({
  getSpacePostLikes: (...args: unknown[]) => mockGetSpacePostLikes(...args),
  getSpacePostQuotes: (...args: unknown[]) => mockGetSpacePostQuotes(...args),
}))
jest.mock('#/state/session', () => ({useAgent: jest.fn()}))

import {fetchLikedByPage} from '../post-liked-by'
import {fetchPostQuotesPage} from '../post-quotes'
import {fetchRepostedByPage} from '../post-reposted-by'

const SPACE = 'at://did:plc:space/space/community.blacksky.feed/test'
const SPACE_POST = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kpost`
const PUBLIC_POST = 'at://did:plc:alice/app.bsky.feed.post/3kpost'
const LEGACY_POST = 'at://did:plc:alice/community.blacksky.feed.post/3kpost'

function mockAgent() {
  const getLikes = jest.fn().mockResolvedValue({
    data: {uri: PUBLIC_POST, likes: []},
  })
  const getQuotes = jest.fn().mockResolvedValue({
    data: {uri: PUBLIC_POST, posts: []},
  })
  const getRepostedBy = jest.fn().mockResolvedValue({
    data: {uri: PUBLIC_POST, repostedBy: []},
  })
  mockGetSpacePostLikes.mockResolvedValue({uri: SPACE_POST, likes: []})
  mockGetSpacePostQuotes.mockResolvedValue({uri: SPACE_POST, posts: []})
  const agent = {
    getLikes,
    getRepostedBy,
    api: {app: {bsky: {feed: {getQuotes}}}},
  } as unknown as BskyAgent
  return {agent, getLikes, getQuotes, getRepostedBy}
}

describe('post engagement routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([PUBLIC_POST, LEGACY_POST])(
    'keeps likes for %s on the standard endpoint',
    async uri => {
      const {agent, getLikes} = mockAgent()

      await fetchLikedByPage(agent, uri, 'next')

      expect(getLikes).toHaveBeenCalledWith({
        uri,
        limit: 30,
        cursor: 'next',
      })
      expect(mockGetSpacePostLikes).not.toHaveBeenCalled()
    },
  )

  it.each([PUBLIC_POST, LEGACY_POST])(
    'keeps quotes for %s on the standard endpoint',
    async uri => {
      const {agent, getQuotes} = mockAgent()

      await fetchPostQuotesPage(agent, uri, 'next')

      expect(getQuotes).toHaveBeenCalledWith({
        uri,
        limit: 30,
        cursor: 'next',
      })
      expect(mockGetSpacePostQuotes).not.toHaveBeenCalled()
    },
  )

  it('uses only the permission-aware endpoints for space engagement', async () => {
    const {agent, getLikes, getQuotes} = mockAgent()

    await fetchLikedByPage(agent, SPACE_POST)
    await fetchPostQuotesPage(agent, SPACE_POST)

    expect(getLikes).not.toHaveBeenCalled()
    expect(getQuotes).not.toHaveBeenCalled()
    expect(mockGetSpacePostLikes).toHaveBeenCalledWith(agent, {
      uri: SPACE_POST,
      limit: 30,
      cursor: undefined,
    })
    expect(mockGetSpacePostQuotes).toHaveBeenCalledWith(agent, {
      uri: SPACE_POST,
      limit: 30,
      cursor: undefined,
    })
  })

  it('never calls the standard repost endpoint for a space URI', async () => {
    const {agent, getRepostedBy} = mockAgent()

    await expect(fetchRepostedByPage(agent, SPACE_POST)).rejects.toThrow(
      'Reposts are not supported for private space posts',
    )
    expect(getRepostedBy).not.toHaveBeenCalled()
  })
})
