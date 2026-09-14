import {type AppBskyFeedDefs} from '@atproto/api'
import {QueryClient} from '@tanstack/react-query'

jest.mock('#/state/session', () => ({useAgent: jest.fn()}))
jest.mock('#/state/queries/notifications/feed', () => ({
  findAllPostsInQueryData: function* () {},
}))
jest.mock('#/view/com/posts/PostFeedErrorMessage', () => ({
  KnownError: {FeedSignedInOnly: 'FeedSignedInOnly'},
}))
jest.mock('#/state/queries/usePostThread', () => ({
  usePostThreadContext: jest.fn(),
}))

import {
  dangerousGetPostShadow,
  updatePostShadow,
} from '#/state/cache/post-shadow'
import {RQKEY_ROOT as POST_FEED_QUERY_KEY_ROOT} from '#/state/queries/post-feed'

const PUBLIC_POST = 'at://did:plc:alice/app.bsky.feed.post/3kpublic'
const LEGACY_POST = 'at://did:plc:alice/community.blacksky.feed.post/3klegacy'
const SPACE_POST =
  'at://did:plc:space/space/community.blacksky.feed/test/did:plc:alice/app.bsky.feed.post/3kspace'

function post(uri: string): AppBskyFeedDefs.PostView {
  return {
    uri,
    cid: 'bafyrei post',
    author: {did: 'did:plc:alice', handle: 'alice.test'},
    record: {$type: 'app.bsky.feed.post', text: 'hello'},
    indexedAt: '2026-08-27T00:00:00.000Z',
  }
}

function cachePost(
  queryClient: QueryClient,
  cachedPost: AppBskyFeedDefs.PostView,
) {
  queryClient.setQueryData([POST_FEED_QUERY_KEY_ROOT, 'following'], {
    pages: [{feed: [{post: cachedPost}]}],
    pageParams: [undefined],
  })
}

describe('post shadow URI matching', () => {
  it.each([PUBLIC_POST, LEGACY_POST])(
    'preserves ordinary matching for %s',
    uri => {
      const queryClient = new QueryClient()
      const cachedPost = post(uri)
      cachePost(queryClient, cachedPost)

      expect(() =>
        updatePostShadow(queryClient, uri, {likeUri: `${uri}/like`}),
      ).not.toThrow()
      expect(dangerousGetPostShadow(cachedPost)?.likeUri).toBe(`${uri}/like`)
    },
  )

  it('updates a cached permissioned-space post without parsing its URI', () => {
    const queryClient = new QueryClient()
    const cachedPost = post(SPACE_POST)
    cachePost(queryClient, cachedPost)

    expect(() =>
      updatePostShadow(queryClient, SPACE_POST, {
        likeUri: 'at://did:plc:alice/app.bsky.feed.like/3klike',
      }),
    ).not.toThrow()
    expect(dangerousGetPostShadow(cachedPost)?.likeUri).toBe(
      'at://did:plc:alice/app.bsky.feed.like/3klike',
    )
  })
})
