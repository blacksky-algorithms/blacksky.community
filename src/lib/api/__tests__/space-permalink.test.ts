import {postPermalink} from '#/lib/routes/links'
import {spacePostUriFromRoute} from '../space-permalink'

const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'
const AUTHOR = {did: 'did:plc:alice', handle: 'alice.test'}
const SPACE_POST = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kabc`

describe('space permalinks', () => {
  it('keeps the ordinary post url and attaches the space', () => {
    expect(postPermalink(AUTHOR, SPACE_POST)).toBe(
      `/profile/did:plc:alice/post/3kabc?space=${encodeURIComponent(SPACE)}`,
    )
  })

  it('carries a suffix segment before the query', () => {
    expect(postPermalink(AUTHOR, SPACE_POST, 'liked-by')).toBe(
      `/profile/did:plc:alice/post/3kabc/liked-by?space=${encodeURIComponent(
        SPACE,
      )}`,
    )
  })

  it.each([
    ['a public post', 'at://did:plc:alice/app.bsky.feed.post/3kabc', ''],
    [
      'the community stub',
      'at://did:plc:alice/community.blacksky.feed.post/3kabc',
      '?collection=community.blacksky.feed.post',
    ],
  ])('leaves %s alone', (_name, uri, query) => {
    expect(postPermalink(AUTHOR, uri)).toBe(
      `/profile/did:plc:alice/post/3kabc${query}`,
    )
  })

  it('round-trips back to the record uri', () => {
    expect(spacePostUriFromRoute(SPACE, 'did:plc:alice', '3kabc')).toBe(
      SPACE_POST,
    )
  })

  it.each([
    ['no space', undefined, 'did:plc:alice'],
    [
      'a malformed space',
      'at://did:plc:community/space/onlythree',
      'did:plc:alice',
    ],
    // A handle cannot stand in for the author: the URI form admits only DIDs,
    // so the caller has to resolve it first.
    ['an unresolved handle', SPACE, 'alice.test'],
  ])('refuses %s', (_name, space, author) => {
    expect(spacePostUriFromRoute(space, author, '3kabc')).toBeNull()
  })
})
