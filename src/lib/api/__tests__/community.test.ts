// The repo-wide stub of this module cannot encode a blob reference.
jest.unmock('multiformats/cid')

import {Client, jsonToLex} from '@atproto/lex'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {createLexClient} from '#/lib/lexClient'
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

  function mockClient(options?: Parameters<typeof createLexClient>[1]) {
    const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
    fetchHandler.mockResolvedValue(new Response('{}'))
    return {client: createLexClient({fetchHandler}, options), fetchHandler}
  }

  function headersOf(
    fetchHandler: jest.Mock<Promise<Response>, [string, RequestInit]>,
  ) {
    return new Headers(fetchHandler.mock.calls[0][1].headers)
  }

  it('sends the moderation authorities the client is configured with', async () => {
    const {client, fetchHandler} = mockClient()
    client.setLabelers(['did:plc:subscribed'])

    await communityXrpc(client, 'community.blacksky.feed.getCommunityTimeline')

    expect(headersOf(fetchHandler).get('atproto-accept-labelers')).toBe(
      [
        ...Client.appLabelers.map(did => `${did};redact`),
        'did:plc:subscribed',
      ].join(', '),
    )
  })

  it('sends no moderation authorities for a client that takes none', async () => {
    const {client, fetchHandler} = mockClient({appLabelers: null})

    await communityXrpc(client, 'community.blacksky.feed.getCommunityTimeline')

    expect(headersOf(fetchHandler).has('atproto-accept-labelers')).toBe(false)
  })

  it('encodes a blob reference in a body as a link', async () => {
    const {client, fetchHandler} = mockClient()
    const link = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
    const image = jsonToLex({
      $type: 'blob',
      ref: {$link: link},
      mimeType: 'image/png',
      size: 10,
    })

    await communityXrpc(client, 'community.blacksky.feed.submitPost', {
      body: {embed: {images: [{image, alt: ''}]}},
    })

    const init = fetchHandler.mock.calls[0][1]
    expect(JSON.parse(init.body as string)).toEqual({
      embed: {
        images: [
          {
            image: {
              $type: 'blob',
              ref: {$link: link},
              mimeType: 'image/png',
              size: 10,
            },
            alt: '',
          },
        ],
      },
    })
  })

  it('always targets the home appview, even when the global proxy header is flipped', async () => {
    BLUESKY_PROXY_HEADER.set(BLUESKY_FALLBACK_PROXY_HEADER)
    const {client, fetchHandler} = mockClient()

    await communityXrpc(client, 'community.blacksky.feed.getCommunityTimeline')

    const init = fetchHandler.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers['atproto-proxy']).toBe(HOME_PROXY_HEADER)
    expect(init.headers['atproto-proxy']).not.toBe(
      BLUESKY_FALLBACK_PROXY_HEADER,
    )
  })

  it('can target a configured content store', async () => {
    const {client, fetchHandler} = mockClient()

    await communityXrpc(client, 'community.blacksky.feed.submitPost', {
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

  it('serializes repeated primitive parameters and omits empty values', async () => {
    const {client, fetchHandler} = mockClient()

    await communityXrpc(
      client,
      'community.blacksky.notification.listNotifications',
      {
        params: {
          reasons: ['mention', 'reply'],
          empty: [],
          limit: 30,
          priority: false,
          cursor: 'before value',
          seenAt: undefined,
        },
      },
    )

    const url = new URL(fetchHandler.mock.calls[0][0], 'https://example.test')
    expect(url.searchParams.getAll('reasons')).toEqual(['mention', 'reply'])
    expect(url.searchParams.get('limit')).toBe('30')
    expect(url.searchParams.get('priority')).toBe('false')
    expect(url.searchParams.get('cursor')).toBe('before value')
    expect(url.searchParams.has('empty')).toBe(false)
    expect(url.searchParams.has('seenAt')).toBe(false)
  })

  it('fetches space likes through the permission-aware endpoint', async () => {
    const {client, fetchHandler} = mockClient()
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

    const page = await getSpacePostLikes(client, {
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
    const {client, fetchHandler} = mockClient()
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

    const page = await getSpacePostQuotes(client, {
      uri: SPACE_POST,
      limit: 30,
    })

    expect(page.uri).toBe(SPACE_POST)
    expect(page.posts[0].$type).toBe('app.bsky.feed.defs#postView')
  })
})
