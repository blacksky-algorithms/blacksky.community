import {postPermalink} from '#/lib/routes/links'
import {postUriToRelativePath} from '#/lib/strings/url-helpers'
import {
  isSpacePostUrl,
  postUriAuthor,
  spacePostUriFromRoute,
} from '../space-permalink'

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

describe('post uri authors', () => {
  it.each([
    [
      'a public post',
      'at://did:plc:public/app.bsky.feed.post/3kroot',
      'did:plc:public',
    ],
    [
      'a legacy community post',
      'at://did:plc:community/community.blacksky.feed.post/3kroot',
      'did:plc:community',
    ],
    ['a permissioned-space post', SPACE_POST, AUTHOR.did],
  ])('finds the author of %s', (_name, uri, expected) => {
    expect(postUriAuthor(uri)).toBe(expected)
  })

  it('does not feed malformed input through as an author', () => {
    expect(postUriAuthor('not-an-at-uri')).toBeNull()
  })
})

describe('recognising a space link before it is expanded', () => {
  const encoded = encodeURIComponent(SPACE)

  it.each([
    [
      'a full url',
      `https://blacksky.community/profile/did:plc:alice/post/3kabc?space=${encoded}`,
    ],
    ['a relative path', `/profile/did:plc:alice/post/3kabc?space=${encoded}`],
    [
      'a suffix route',
      `https://bsky.app/profile/did:plc:alice/post/3kabc/liked-by?space=${encoded}`,
    ],
    [
      'an unencoded space param',
      `/profile/did:plc:alice/post/3kabc?space=${SPACE}`,
    ],
  ])('spots %s', (_name, url) => {
    expect(isSpacePostUrl(url)).toBe(true)
  })

  it.each([
    ['a public post url', 'https://bsky.app/profile/alice.test/post/3kabc'],
    [
      'a community stub url',
      '/profile/did:plc:alice/post/3kabc?collection=community.blacksky.feed.post',
    ],
    [
      'a space param that is not a space uri',
      '/profile/did:plc:alice/post/3kabc?space=nonsense',
    ],
    ['nothing', undefined],
  ])('ignores %s', (_name, url) => {
    expect(isSpacePostUrl(url)).toBe(false)
  })
})

describe('space post urls survive the composer round trip', () => {
  it('encodes and decodes back to the same record uri', () => {
    const path = postUriToRelativePath(SPACE_POST)
    expect(path).toBe(
      `/profile/did:plc:alice/post/3kabc?space=${encodeURIComponent(SPACE)}`,
    )
    // What resolveLink does on the way back: read the parts out of the url.
    const url = new URL(path!, 'http://_')
    const [, user, , rkey] = url.pathname.split('/').filter(Boolean)
    expect(
      spacePostUriFromRoute(
        url.searchParams.get('space') ?? undefined,
        user,
        rkey,
      ),
    ).toBe(SPACE_POST)
  })
})
