
const mockCommunityXrpc = jest.fn()

jest.mock('#/lib/api/community', () => ({
  communityXrpc: (...args: unknown[]) => mockCommunityXrpc(...args),
}))
jest.mock('#/state/queries/profile', () => ({precacheProfile: jest.fn()}))

import {type Client} from '@atproto/lex'
import {type FeedNotification} from '../types'
import {fetchSubjects} from '../util'
import {app} from '#/lexicons'

const SPACE = 'at://did:plc:space/space/community.blacksky.feed/test'

const subject = (rkey: string): FeedNotification => {
  const uri = `${SPACE}/did:plc:alice/app.bsky.feed.post/${rkey}`
  return {
    subjectUri: uri,
    notification: {},
  } as FeedNotification
}

describe('space notification subject hydration', () => {
  it('routes like, reply, and quote subjects through getCommunityPost', async () => {
    const notifications = [subject('like'), subject('reply'), subject('quote')]
    mockCommunityXrpc.mockImplementation(
      (client: Client, _method: string, opts: {params: {uri: string}}) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              post: {
                uri: opts.params.uri,
                cid: 'bafypost',
                author: {did: 'did:plc:alice', handle: 'alice.test'},
                record: {$type: 'app.bsky.feed.post', text: 'private'},
                indexedAt: '2026-08-27T12:00:00.000Z',
              },
            }),
          ),
        ),
    )
    const getPosts = jest.fn()
    const getStarterPacks = jest.fn().mockResolvedValue({starterPacks: []})
    const client = {
      call: (method: unknown, params: unknown) =>
        method === app.bsky.feed.getPosts
          ? getPosts(params)
          : getStarterPacks(params),
    } as unknown as Client

    const result = await fetchSubjects(client, notifications)

    expect(mockCommunityXrpc).toHaveBeenCalledTimes(3)
    expect(mockCommunityXrpc.mock.calls.map(([, method]) => method)).toEqual([
      'community.blacksky.feed.getCommunityPost',
      'community.blacksky.feed.getCommunityPost',
      'community.blacksky.feed.getCommunityPost',
    ])
    expect(getPosts).not.toHaveBeenCalled()
    expect(result.posts.size).toBe(3)
  })
})
