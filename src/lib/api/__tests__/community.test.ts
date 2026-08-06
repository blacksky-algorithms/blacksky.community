import {type BskyAgent} from '@atproto/api'

import {
  BLUESKY_FALLBACK_PROXY_HEADER,
  BLUESKY_PROXY_HEADER,
  HOME_PROXY_HEADER,
} from '#/lib/constants'
import {communityXrpc} from '../community'

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
})
