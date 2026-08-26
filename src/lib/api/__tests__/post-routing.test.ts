import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {post, quotedSpace, resolveReply} from '../index'
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

describe('quoting a space post from outside the space', () => {
  const SPACE_POST = `${SPACE}/did:plc:bob/app.bsky.feed.post/3kabc`
  const permalink = `https://blacksky.community/profile/did:plc:bob/post/3kabc?space=${encodeURIComponent(
    SPACE,
  )}`

  const threadQuoting = (uri: string, space?: string) =>
    ({
      ...(threadWith(space) as object),
      posts: [
        {
          richtext: {text: '', facets: []},
          shortenedGraphemeLength: 0,
          labels: [],
          embed: {quote: {type: 'link', uri}},
        },
      ],
    }) as never

  beforeEach(() => jest.clearAllMocks())

  // The link form is what the composer actually holds: it is only expanded to
  // the at:// form at publish, after routing has already decided.
  it.each([
    ['a pasted permalink', permalink],
    ['an at:// space record uri', SPACE_POST],
  ])(
    'refuses %s rather than writing it to the public repo',
    async (_n, uri) => {
      const {agent, applyWrites, fetchHandler} = mockAgent()

      await expect(
        post(agent, queryClient, {thread: threadQuoting(uri)}),
      ).rejects.toThrow(/private post/)

      expect(applyWrites).not.toHaveBeenCalled()
      expect(fetchHandler).not.toHaveBeenCalled()
      expect(postToSpace).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['opened from the space post', {communitySpaceUri: SPACE}],
    ['composing into the space-backed feed', {}],
  ])(
    'allows the quote when the post goes into that space (%s)',
    async (_n, extra) => {
      const {agent} = mockAgent()

      await post(agent, queryClient, {
        thread: {
          ...(threadQuoting(permalink, SPACE) as object),
          ...extra,
        } as never,
      })

      expect(postToSpace).toHaveBeenCalled()
    },
  )
})

describe('quotedSpace', () => {
  const OTHER = 'at://did:plc:community/space/community.blacksky.feed/other'

  it('reads the space out of either form', () => {
    expect(quotedSpace(`${SPACE}/did:plc:bob/app.bsky.feed.post/3kabc`)).toBe(
      SPACE,
    )
    expect(
      quotedSpace(
        `/profile/did:plc:bob/post/3kabc?space=${encodeURIComponent(OTHER)}`,
      ),
    ).toBe(OTHER)
  })

  it.each([
    ['a public post', 'at://did:plc:bob/app.bsky.feed.post/3kabc'],
    ['a community stub', 'at://did:plc:bob/community.blacksky.feed.post/3kabc'],
    ['a bare space uri with no record', SPACE],
    ['nothing', undefined],
  ])('returns null for %s', (_n, uri) => {
    expect(quotedSpace(uri)).toBeNull()
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

describe('resolveReply public-path guard', () => {
  const publicParent = 'at://did:plc:bob/app.bsky.feed.post/3kparent'
  const spaceRecord = `${SPACE}/did:plc:bob/app.bsky.feed.post/3kroot`

  const agentReturningRoot = (rootUri: string) =>
    ({
      app: {
        bsky: {
          feed: {
            getPosts: jest.fn(() =>
              Promise.resolve({
                data: {
                  posts: [
                    {
                      uri: publicParent,
                      cid: 'bafyreiparent',
                      record: {
                        $type: 'app.bsky.feed.post',
                        text: 'hi',
                        createdAt: '2026-08-09T12:00:00.000Z',
                        reply: {
                          root: {uri: rootUri, cid: 'bafyreiroot'},
                          parent: {uri: publicParent, cid: 'bafyreiparent'},
                        },
                      },
                    },
                  ],
                },
              }),
            ),
          },
        },
      },
    }) as unknown as AtpAgent

  it('refuses to hand a space thread root to the public write path', async () => {
    await expect(
      resolveReply(agentReturningRoot(spaceRecord), publicParent),
    ).rejects.toThrow(/private post/i)
  })

  it('passes an ordinary thread root through', async () => {
    const root = 'at://did:plc:bob/app.bsky.feed.post/3kroot'
    await expect(
      resolveReply(agentReturningRoot(root), publicParent),
    ).resolves.toEqual({
      root: {uri: root, cid: 'bafyreiroot'},
      parent: {uri: publicParent, cid: 'bafyreiparent'},
    })
  })
})
