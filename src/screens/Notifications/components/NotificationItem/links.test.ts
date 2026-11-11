import {makePostLink} from './links'

const author = {did: 'did:plc:alice', handle: 'alice.test'}
const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'

describe('makePostLink', () => {
  it('links a public post by its record key', () => {
    expect(
      makePostLink({
        uri: 'at://did:plc:alice/app.bsky.feed.post/3kpub',
        author,
      }),
    ).toBe('/profile/did:plc:alice/post/3kpub')
  })

  it('keeps sub-routes ahead of the query', () => {
    expect(
      makePostLink(
        {uri: 'at://did:plc:alice/app.bsky.feed.post/3kpub', author},
        'liked-by',
      ),
    ).toBe('/profile/did:plc:alice/post/3kpub/liked-by')
  })

  it('names the space of a post in a permissioned space', () => {
    expect(
      makePostLink({
        uri: `${SPACE}/did:plc:alice/app.bsky.feed.post/3kprivate`,
        author,
      }),
    ).toBe(
      `/profile/did:plc:alice/post/3kprivate?space=${encodeURIComponent(SPACE)}`,
    )
  })

  it('names the collection of a community post', () => {
    expect(
      makePostLink(
        {uri: 'at://did:plc:alice/community.blacksky.feed.post/3kcomm', author},
        'liked-by',
      ),
    ).toBe(
      '/profile/did:plc:alice/post/3kcomm/liked-by?collection=community.blacksky.feed.post',
    )
  })
})
