
const mockGetSpacePostLikes = jest.fn()
const mockGetSpacePostQuotes = jest.fn()

jest.mock('#/lib/api/community', () => ({
  getSpacePostLikes: (...args: unknown[]) => mockGetSpacePostLikes(...args),
  getSpacePostQuotes: (...args: unknown[]) => mockGetSpacePostQuotes(...args),
}))
jest.mock('#/state/session', () => ({useAgent: jest.fn()}))

import {type Client} from '@atproto/lex'
import {fetchLikedByPage, fetchLikedBySample} from '../post-liked-by'
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
  const client = {
    getLikes,
    getRepostedBy,
    api: {app: {bsky: {feed: {getQuotes}}}},
  } as unknown as BskyAgent
  return {client, getLikes, getQuotes, getRepostedBy}
}

describe('post engagement routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([PUBLIC_POST, LEGACY_POST])(
    'keeps likes for %s on the standard endpoint',
    async uri => {
      const {client, getLikes} = mockAgent()

      await fetchLikedByPage(client, uri, 'next')

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
      const {client, getQuotes} = mockAgent()

      await fetchPostQuotesPage(client, uri, 'next')

      expect(getQuotes).toHaveBeenCalledWith({
        uri,
        limit: 30,
        cursor: 'next',
      })
      expect(mockGetSpacePostQuotes).not.toHaveBeenCalled()
    },
  )

  it('uses only the permission-aware endpoints for space engagement', async () => {
    const {client, getLikes, getQuotes} = mockAgent()

    await fetchLikedByPage(client, SPACE_POST)
    await fetchPostQuotesPage(client, SPACE_POST)

    expect(getLikes).not.toHaveBeenCalled()
    expect(getQuotes).not.toHaveBeenCalled()
    expect(mockGetSpacePostLikes).toHaveBeenCalledWith(client, {
      uri: SPACE_POST,
      limit: 30,
      cursor: undefined,
    })
    expect(mockGetSpacePostQuotes).toHaveBeenCalledWith(client, {
      uri: SPACE_POST,
      limit: 30,
      cursor: undefined,
    })
  })

  it('samples known likers of a space post from the permission-aware endpoint', async () => {
    const {client, getLikes} = mockAgent()

    await fetchLikedBySample(client, SPACE_POST)

    expect(getLikes).not.toHaveBeenCalled()
    expect(mockGetSpacePostLikes).toHaveBeenCalledTimes(1)
    expect(mockGetSpacePostLikes).toHaveBeenCalledWith(client, {
      uri: SPACE_POST,
      limit: 100,
    })
  })

  it('samples known likers of a public post from the standard endpoint', async () => {
    const {client, getLikes} = mockAgent()

    await fetchLikedBySample(client, PUBLIC_POST)

    expect(mockGetSpacePostLikes).not.toHaveBeenCalled()
    expect(getLikes).toHaveBeenCalledTimes(1)
    expect(getLikes).toHaveBeenCalledWith({uri: PUBLIC_POST, limit: 100})
  })

  it('never calls the standard repost endpoint for a space URI', async () => {
    const {client, getRepostedBy} = mockAgent()

    await expect(fetchRepostedByPage(client, SPACE_POST)).rejects.toThrow(
      'Reposts are not supported for private space posts',
    )
    expect(getRepostedBy).not.toHaveBeenCalled()
  })
})
