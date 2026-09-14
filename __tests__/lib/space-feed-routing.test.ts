// `jsonToLex` walks the body looking for CID links, and the multiformats CID
// helper it uses does not load under jest's module resolution. Nothing here is
// about CID inflation, so it is stubbed to a passthrough.
jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  jsonToLex: (value: unknown) => value,
}))

import {type AtpAgent} from '@atproto/api'

import {CustomFeedAPI} from '#/lib/api/feed/custom'
import {toPostView, toSpaceFeedPage} from '#/lib/api/space-views'

const FEED = 'at://did:plc:community/app.bsky.feed.generator/private'
const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'
const POST = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kaaa`

const config = {
  $type: 'community.blacksky.feed.config',
  contentType: 'communityRecord',
  visibility: 'gated',
  group: 'at://did:plc:community/app.bsky.graph.list/members',
  createdAt: '2026-08-18T00:00:00.000Z',
  space: SPACE,
}

type FakeAgent = {
  did?: string
  fetchHandler: jest.Mock
  app: {bsky: {feed: {getFeed: jest.Mock}}}
  com: {atproto: {repo: {getRecord: jest.Mock}}}
}

function agent({did}: {did?: string}): FakeAgent {
  const getFeed = jest.fn()
  const fetchHandler = jest.fn((path: string) => {
    if (path.includes('community.blacksky.feed.getSpaceFeed')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            cursor: '2026-08-18T00:00:00.000Z::bafyone',
            feed: [
              {
                post: {
                  $type: 'community.blacksky.feed.defs#spacePostView',
                  uri: POST,
                  cid: 'bafyone',
                  author: {did: 'did:plc:alice', handle: 'alice.test'},
                  record: {$type: 'app.bsky.feed.post', text: 'hi'},
                  indexedAt: '2026-08-18T00:00:00.000Z',
                  communitySpace: SPACE,
                },
              },
            ],
          }),
          {status: 200, headers: {'content-type': 'application/json'}},
        ),
      )
    }
    throw new Error(`unexpected request: ${path}`)
  })
  return {
    did,
    fetchHandler,
    app: {bsky: {feed: {getFeed}}},
    com: {
      atproto: {
        repo: {
          getRecord: jest.fn(() => Promise.resolve({data: {value: config}})),
        },
      },
    },
  }
}

// The feed APIs take a real `AtpAgent`; only the four members above are
// reachable on this path, so the fake is narrowed rather than filled in.
const asAgent = (a: FakeAgent) => a as unknown as AtpAgent

describe('space-backed feed routing', () => {
  it('reads a space feed through the private endpoint and never the standard one', async () => {
    const a = agent({did: 'did:plc:alice'})
    const api = new CustomFeedAPI({agent: asAgent(a), feedParams: {feed: FEED}})

    const page = await api.fetch({cursor: undefined, limit: 30})

    expect(a.app.bsky.feed.getFeed).not.toHaveBeenCalled()
    expect(page.feed).toHaveLength(1)
    // The real space record URI survives: every later interaction (like,
    // delete, permalink, thread) targets it.
    expect(page.feed[0].post.uri).toBe(POST)
    expect(page.feed[0].post.$type).toBe('app.bsky.feed.defs#postView')
  })

  it('peekLatest uses the same endpoint, so polling agrees with pagination', async () => {
    const a = agent({did: 'did:plc:alice'})
    const api = new CustomFeedAPI({agent: asAgent(a), feedParams: {feed: FEED}})

    await api.peekLatest()

    expect(a.app.bsky.feed.getFeed).not.toHaveBeenCalled()
    expect(a.fetchHandler).toHaveBeenCalled()
  })

  it('refuses logged out rather than falling back to the public appview', async () => {
    const a = agent({})
    const api = new CustomFeedAPI({agent: asAgent(a), feedParams: {feed: FEED}})

    await expect(api.fetch({cursor: undefined, limit: 30})).rejects.toThrow(
      'FeedSignedInOnly',
    )
    await expect(api.peekLatest()).rejects.toThrow('FeedSignedInOnly')
    expect(a.fetchHandler).not.toHaveBeenCalled()
  })
})

describe('private view type mapping', () => {
  it('renames the whole tree, quote embeds included', () => {
    const page = toSpaceFeedPage({
      feed: [
        {
          post: {
            $type: 'community.blacksky.feed.defs#spacePostView',
            uri: POST,
            cid: 'bafyone',
            author: {did: 'did:plc:alice'},
            record: {},
            indexedAt: '2026-08-18T00:00:00.000Z',
            embed: {
              $type: 'community.blacksky.feed.defs#spaceRecordView',
              record: {
                $type: 'community.blacksky.feed.defs#spaceViewRecord',
                uri: POST,
              },
            },
          },
        },
      ],
    })
    const embed = page.feed[0].post.embed as unknown as Record<
      string,
      Record<string, string>
    >
    expect(embed.$type).toBe('app.bsky.embed.record#view')
    expect(embed.record.$type).toBe('app.bsky.embed.record#viewRecord')
    // A space URI is carried through untouched; nothing parses it.
    expect(embed.record.uri).toBe(POST)
  })

  it('drops a structurally invalid row instead of the whole page', () => {
    const page = toSpaceFeedPage({feed: [{post: {}}, {nope: true}]})
    expect(page.feed).toEqual([])
    expect(toPostView({uri: 42})).toBeUndefined()
  })
})
