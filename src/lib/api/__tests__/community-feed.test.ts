
import {type Client, XrpcResponseError} from '@atproto/lex'

import {com} from '#/lexicons'
import {
  ADMIT_FEED_POST,
  admitFeedPost,
  CHECK_FEED_PERMISSIONS,
  fetchCommunityFeedConfig,
  fetchCommunityFeedConfigStrict,
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

function xrpcError(status: number, error: string) {
  return new XrpcResponseError(
    com.atproto.repo.getRecord.main,
    new Response(null, {status}),
    {encoding: 'application/json', body: {error, message: error}},
  )
}

function mockClient() {
  const getRecord = jest.fn(({collection}: {collection: string}) => {
    if (collection === 'community.blacksky.feed.config') {
      return Promise.resolve({value: config})
    }
    return Promise.resolve({value: {$type: collection, did: serviceDid}})
  })
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit?]>()
  return {
    client: {
      call: (_method: unknown, params: {collection: string}) =>
        getRecord(params),
      agent: {fetchHandler},
    } as unknown as Client,
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
    const {client, getRecord} = mockClient()

    await expect(fetchCommunityFeedConfig(client, feed)).resolves.toEqual(config)
    await expect(fetchFeedServiceDid(client, feed)).resolves.toBe(serviceDid)

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

  it('distinguishes an absent config from a failed config read', async () => {
    const {client, getRecord} = mockClient()
    getRecord.mockRejectedValueOnce(xrpcError(400, 'RecordNotFound'))

    await expect(
      fetchCommunityFeedConfigStrict(client, feed),
    ).resolves.toBeNull()

    getRecord.mockRejectedValueOnce(xrpcError(503, 'UpstreamFailure'))
    await expect(fetchCommunityFeedConfigStrict(client, feed)).rejects.toThrow(
      'UpstreamFailure',
    )
  })

  it('checks self-scoped permissions with exact service auth and filters unknown values', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(
      new Response(
        JSON.stringify({
          permissions: ['canView', 'futurePermission', 'canPost'],
        }),
      ),
    )

    await expect(fetchFeedPermissions(client, feed)).resolves.toEqual([
      'canView',
      'canPost',
    ])
    expect(getServiceAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
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
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(new Response('{}', {status: 403}))

    await expect(fetchFeedPermissions(client, feed)).resolves.toEqual([])
  })

  it('resolves a post target only when the user can post', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify({permissions: ['canView', 'canPost']})),
    )

    await expect(fetchCommunityFeedTarget(client, feed)).resolves.toEqual({
      feed,
      name: feed,
      serviceDid,
      config,
    })
  })

  it('fails closed when resolving a post target without canPost', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify({permissions: ['canView']})),
    )

    await expect(fetchCommunityFeedTarget(client, feed)).resolves.toBeNull()
  })

  it('admits a canonical record through the feed generator service', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(new Response('{}'))
    const post = 'at://did:plc:author/app.bsky.feed.post/3m2post'

    await admitFeedPost(
      client,
      {feed, name: 'Community', serviceDid, config},
      post,
      'bafyrecordcid',
    )

    expect(getServiceAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({client, aud: serviceDid, lxm: ADMIT_FEED_POST}),
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
