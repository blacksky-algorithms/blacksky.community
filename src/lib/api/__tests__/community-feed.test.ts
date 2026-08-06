import {type AtpAgent} from '@atproto/api'

import {
  ADMIT_FEED_POST,
  admitFeedPost,
  CHECK_FEED_PERMISSIONS,
  fetchCommunityFeedConfig,
  fetchCommunityFeedTarget,
  fetchFeedPermissions,
  fetchFeedServiceDid,
} from '../community-feed'
import {getServiceAuthToken} from '../service-auth'

jest.mock('../service-auth', () => ({
  getServiceAuthToken: jest.fn(),
}))

const feed = 'at://did:plc:community/app.bsky.feed.generator/3m2communityfeed'
const serviceDid = 'did:web:feeds.example.com'
const config = {
  $type: 'community.blacksky.feed.config',
  contentType: 'publicRecord',
  visibility: 'public',
  policyMode: 'public',
  group: 'at://did:plc:community/community.blacksky.group/community',
  createdAt: '2026-08-06T12:00:00.000Z',
} as const

function mockAgent() {
  const getRecord = jest.fn(({collection}: {collection: string}) => {
    if (collection === 'community.blacksky.feed.config') {
      return Promise.resolve({data: {value: config}})
    }
    return Promise.resolve({
      data: {value: {$type: collection, did: serviceDid}},
    })
  })
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit?]>()
  return {
    agent: {
      com: {atproto: {repo: {getRecord}}},
      fetchHandler,
    } as unknown as AtpAgent,
    fetchHandler,
    getRecord,
  }
}

describe('community feed API', () => {
  beforeEach(() => {
    jest.mocked(getServiceAuthToken).mockReset()
    jest.mocked(getServiceAuthToken).mockResolvedValue('service-token')
  })

  it('loads config and generator records from the feed owner at the same rkey', async () => {
    const {agent, getRecord} = mockAgent()

    await expect(fetchCommunityFeedConfig(agent, feed)).resolves.toEqual(config)
    await expect(fetchFeedServiceDid(agent, feed)).resolves.toBe(serviceDid)

    expect(getRecord).toHaveBeenNthCalledWith(1, {
      repo: 'did:plc:community',
      collection: 'community.blacksky.feed.config',
      rkey: '3m2communityfeed',
    })
    expect(getRecord).toHaveBeenNthCalledWith(2, {
      repo: 'did:plc:community',
      collection: 'app.bsky.feed.generator',
      rkey: '3m2communityfeed',
    })
  })

  it('checks self-scoped permissions with exact service auth and filters unknown values', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(
        JSON.stringify({
          permissions: ['canView', 'futurePermission', 'canPost'],
        }),
      ),
    )

    await expect(fetchFeedPermissions(agent, feed)).resolves.toEqual([
      'canView',
      'canPost',
    ])
    expect(getServiceAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        agent,
        aud: serviceDid,
        lxm: CHECK_FEED_PERMISSIONS,
      }),
    )
    expect(fetchHandler).toHaveBeenCalledWith(
      `/xrpc/${CHECK_FEED_PERMISSIONS}?feed=${encodeURIComponent(feed)}`,
      {
        headers: {
          Authorization: 'Bearer service-token',
          'atproto-proxy': `${serviceDid}#bsky_fg`,
        },
      },
    )
  })

  it('fails closed when the permission service rejects the request', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(new Response('{}', {status: 403}))

    await expect(fetchFeedPermissions(agent, feed)).resolves.toEqual([])
  })

  it('resolves a post target only when the user can post', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify({permissions: ['canView', 'canPost']})),
    )

    await expect(fetchCommunityFeedTarget(agent, feed)).resolves.toEqual({
      feed,
      name: feed,
      serviceDid,
      config,
    })
  })

  it('fails closed when resolving a post target without canPost', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify({permissions: ['canView']})),
    )

    await expect(fetchCommunityFeedTarget(agent, feed)).resolves.toBeNull()
  })

  it('admits a canonical record through the feed generator service', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(new Response('{}'))
    const post = 'at://did:plc:author/app.bsky.feed.post/3m2post'

    await admitFeedPost(
      agent,
      {feed, name: 'Community', serviceDid, config},
      post,
      'bafyrecordcid',
    )

    expect(getServiceAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({agent, aud: serviceDid, lxm: ADMIT_FEED_POST}),
    )
    expect(fetchHandler).toHaveBeenCalledWith(`/xrpc/${ADMIT_FEED_POST}`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer service-token',
        'Content-Type': 'application/json',
        'atproto-proxy': `${serviceDid}#bsky_fg`,
      },
      body: JSON.stringify({feed, post, cid: 'bafyrecordcid'}),
    })
  })
})
