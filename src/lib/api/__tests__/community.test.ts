import {type BskyAgent} from '@atproto/api'

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  jsonToLex: (value: unknown) => value,
}))

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {
  communityXrpc,
  getSpacePostLikes,
  getSpacePostQuotes,
} from '../community'

const SPACE = 'at://did:plc:space/space/community.blacksky.feed/test'
const SPACE_POST = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kpost`

describe('communityXrpc', () => {
  const originalHeader = BLUESKY_PROXY_HEADER.get()

  afterEach(() => {
    BLUESKY_PROXY_HEADER.set(originalHeader)
  })

  function mockAgent() {
    const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
    fetchHandler.mockResolvedValue(new Response('{}'))
    return {agent: {fetchHandler} as unknown as BskyAgent, fetchHandler}
  }

  it('always targets the home appview, even when the global proxy header is flipped', async () => {
    BLUESKY_PROXY_HEADER.set(BLUESKY_FALLBACK_PROXY_HEADER)
    const {agent, fetchHandler} = mockAgent()

    await communityXrpc(agent, 'community.blacksky.feed.getCommunityTimeline')

    const init = fetchHandler.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers['atproto-proxy']).toBe(HOME_PROXY_HEADER)
    expect(init.headers['atproto-proxy']).not.toBe(
      BLUESKY_FALLBACK_PROXY_HEADER,
    )
  })

  it('can target a configured content store', async () => {
    const {agent, fetchHandler} = mockAgent()

    await communityXrpc(agent, 'community.blacksky.feed.submitPost', {
      body: {text: 'hello'},
      serviceDid: 'did:web:content.example.com',
    })

    const init = fetchHandler.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers['atproto-proxy']).toBe(
      'did:web:content.example.com#bsky_appview',
    )
  })

  it('fetches space likes through the permission-aware endpoint', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(
        JSON.stringify({
          uri: SPACE_POST,
          cursor: 'next',
          likes: [
            {
              indexedAt: '2026-08-27T12:00:00.000Z',
              createdAt: '2026-08-27T11:00:00.000Z',
              actor: {did: 'did:plc:bob', handle: 'bob.test'},
            },
          ],
        }),
      ),
    )

    const page = await getSpacePostLikes(agent, {
      uri: SPACE_POST,
      limit: 30,
      cursor: 'before',
    })

    expect(page.cursor).toBe('next')
    expect(page.likes[0].actor.did).toBe('did:plc:bob')
    expect(fetchHandler).toHaveBeenCalledWith(
      expect.stringContaining(
        '/xrpc/community.blacksky.feed.getSpacePostLikes?',
      ),
      expect.objectContaining({method: 'GET'}),
    )
    const url = new URL(fetchHandler.mock.calls[0][0], 'https://example.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      uri: SPACE_POST,
      limit: '30',
      cursor: 'before',
    })
  })

  it('converts custom space quote views into standard renderer views', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: 'next',
          posts: [
            {
              $type: 'community.blacksky.feed.defs#spacePostView',
              uri: `${SPACE}/did:plc:bob/app.bsky.feed.post/3kquote`,
              cid: 'bafyquote',
              author: {did: 'did:plc:bob', handle: 'bob.test'},
              record: {$type: 'app.bsky.feed.post', text: 'quote'},
              indexedAt: '2026-08-27T12:00:00.000Z',
            },
          ],
        }),
      ),
    )

    const page = await getSpacePostQuotes(agent, {
      uri: SPACE_POST,
      limit: 30,
    })

    expect(page.uri).toBe(SPACE_POST)
    expect(page.posts[0].$type).toBe('app.bsky.feed.defs#postView')
  })
})
