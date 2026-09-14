import {type AtpAgent} from '@atproto/api'

const mockCommunityXrpc = jest.fn()

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  jsonToLex: (value: unknown) => value,
}))
jest.mock('#/lib/api/community', () => ({
  communityXrpc: (...args: unknown[]) => mockCommunityXrpc(...args),
}))
jest.mock('#/state/queries/profile', () => ({precacheProfile: jest.fn()}))

import {type FeedNotification} from '../types'
import {fetchSubjects} from '../util'

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
      (_agent: AtpAgent, _method: string, opts: {params: {uri: string}}) =>
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
    const getStarterPacks = jest.fn().mockResolvedValue({
      data: {starterPacks: []},
    })
    const agent = {
      app: {
        bsky: {
          feed: {getPosts},
          graph: {getStarterPacks},
        },
      },
    } as unknown as AtpAgent

    const result = await fetchSubjects(agent, notifications)

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
