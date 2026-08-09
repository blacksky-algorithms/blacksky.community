import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {post} from '../index'
import {postToSpace} from '../space-post'

// `post()`'s module graph reaches the image picker, which pulls in native UI
// modules that cannot load under jest. Only the write routing is under test.
jest.mock('#/state/gallery', () => ({compressImage: jest.fn()}))
jest.mock('#/state/queries/resolve-link', () => ({
  fetchResolveGifQuery: jest.fn(),
  fetchResolveLinkQuery: jest.fn(),
}))
jest.mock('#/state/queries/threadgate', () => ({
  createThreadgateRecord: jest.fn(),
  threadgateAllowUISettingToAllowRecordValue: jest.fn(() => []),
}))

jest.mock('../space-post', () => ({
  postToSpace: jest.fn(() => Promise.resolve({uris: ['at://space/post']})),
}))

const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'

const feedConfig = (space?: string) => ({
  $type: 'community.blacksky.feed.config',
  contentType: 'communityRecord',
  visibility: 'gated',
  group: 'at://did:plc:community/community.blacksky.group/community',
  createdAt: '2026-08-09T12:00:00.000Z',
  ...(space ? {space} : {}),
})

const threadWith = (space?: string) =>
  ({
    posts: [],
    postgate: {},
    threadgate: [],
    blackskyOnly: false,
    communityFeed: {
      feed: 'at://did:plc:community/app.bsky.feed.generator/3m2feed',
      name: 'Private',
      serviceDid: 'did:web:feeds.example.com',
      config: feedConfig(space),
    },
  }) as never

function mockAgent() {
  const fetchHandler = jest.fn()
  const applyWrites = jest.fn(() => Promise.resolve({}))
  return {
    agent: {
      assertDid: 'did:plc:alice',
      fetchHandler,
      com: {atproto: {repo: {applyWrites}}},
    } as unknown as AtpAgent,
    fetchHandler,
    applyWrites,
  }
}

const queryClient = {invalidateQueries: jest.fn()} as unknown as QueryClient

describe('post routing', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends a space-backed feed down the space write path', async () => {
    const {agent, fetchHandler, applyWrites} = mockAgent()

    await post(agent, queryClient, {thread: threadWith(SPACE)})

    expect(postToSpace).toHaveBeenCalledWith(agent, queryClient, SPACE, {
      thread: threadWith(SPACE),
    })
    // Nothing may reach the appview or the public repo on this path.
    expect(fetchHandler).not.toHaveBeenCalled()
    expect(applyWrites).not.toHaveBeenCalled()
  })

  it('leaves a feed without a space on the community path', async () => {
    const {agent, applyWrites} = mockAgent()

    await post(agent, queryClient, {thread: threadWith(undefined)})

    expect(postToSpace).not.toHaveBeenCalled()
    expect(applyWrites).toHaveBeenCalled()
  })
})

describe('space replies', () => {
  it('passes the reply target down to the space write path', async () => {
    const {agent} = mockAgent()
    const parent = `${SPACE}/did:plc:bob/app.bsky.feed.post/3kparent`

    await post(agent, queryClient, {
      thread: threadWith(SPACE),
      replyTo: parent,
    })

    // postToSpace resolves the parent itself; what matters here is that the
    // reply is routed into the space at all rather than posted publicly.
    expect(postToSpace).toHaveBeenCalledWith(agent, queryClient, SPACE, {
      thread: threadWith(SPACE),
      replyTo: parent,
    })
  })
})
