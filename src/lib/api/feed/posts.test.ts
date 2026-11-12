import {type Client} from '@atproto/lex'

import {
  CommunityPostError,
  fetchCommunityPostView,
} from '#/lib/api/community-post'
import {app} from '#/lexicons'
import {PostListFeedAPI} from './posts'

jest.mock('#/lib/api/community-post', () => ({
  ...jest.requireActual<typeof import('#/lib/api/community-post')>(
    '#/lib/api/community-post',
  ),
  fetchCommunityPostView: jest.fn(),
}))

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const PUBLIC = 'at://did:plc:alice/app.bsky.feed.post/3kpub'
const PRIVATE = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kprivate`
const COMMUNITY = 'at://did:plc:alice/community.blacksky.feed.post/3kcomm'

const post = (uri: string) => ({uri}) as app.bsky.feed.defs.PostView

function setup(uris: string[]) {
  const call = jest.fn((_method: unknown, params: {uris: string[]}) =>
    Promise.resolve({posts: params.uris.map(post)}),
  )
  const api = new PostListFeedAPI({
    client: {call} as unknown as Client,
    feedParams: {uris} as never,
  })
  return {api, call}
}

describe('PostListFeedAPI', () => {
  beforeEach(() => {
    jest
      .mocked(fetchCommunityPostView)
      .mockReset()
      .mockImplementation((_client, uri) => Promise.resolve(post(uri)))
  })

  it('reads community and space posts through the gated route, in the given order', async () => {
    const {api, call} = setup([PRIVATE, PUBLIC, COMMUNITY])

    const page = await api.fetch({})

    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(app.bsky.feed.getPosts, {uris: [PUBLIC]})
    expect(page.feed.map(item => item.post.uri)).toEqual([
      PRIVATE,
      PUBLIC,
      COMMUNITY,
    ])
  })

  it('leaves out a community post the viewer can no longer read', async () => {
    jest
      .mocked(fetchCommunityPostView)
      .mockRejectedValue(new CommunityPostError('NotAMember', 403))
    const {api} = setup([PRIVATE, PUBLIC])

    const page = await api.fetch({})

    expect(page.feed.map(item => item.post.uri)).toEqual([PUBLIC])
  })

  it.each([
    ['a server error', new CommunityPostError('down', 503)],
    ['a network failure', new TypeError('Network request failed')],
  ])(
    'fails the page on %s rather than showing fewer posts',
    async (_name, e) => {
      jest.mocked(fetchCommunityPostView).mockRejectedValue(e)
      const {api} = setup([PRIVATE, PUBLIC])

      await expect(api.fetch({})).rejects.toBe(e)
    },
  )

  it('skips the standard route when every post is community content', async () => {
    const {api, call} = setup([PRIVATE])

    await api.fetch({})

    expect(call).not.toHaveBeenCalled()
  })
})
