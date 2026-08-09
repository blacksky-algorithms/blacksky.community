import {getCommunitySpaceUri} from '../community-post'

const post = (communitySpace?: unknown) =>
  ({
    uri: 'at://did:plc:author/community.blacksky.feed.post/3m2post',
    communitySpace,
  }) as never

describe(getCommunitySpaceUri, () => {
  it('accepts a space URI', () => {
    const space = 'at://did:plc:community/space/community.blacksky.feed/private'

    expect(getCommunitySpaceUri(post(space))).toBe(space)
  })

  it.each([
    undefined,
    42,
    'not-an-at-uri',
    // A feed generator URI is not a space: the field names where content
    // lives, and a feed is only a view over it.
    'at://did:plc:community/app.bsky.feed.generator/3m2communityfeed',
    'at://did:plc:community/community.blacksky.feed.config/3m2communityfeed',
    // A record inside a space is not the space itself.
    'at://did:plc:c/space/community.blacksky.feed/main/did:plc:a/app.bsky.feed.post/3k',
  ])('rejects absent or invalid space context: %p', communitySpace => {
    expect(getCommunitySpaceUri(post(communitySpace))).toBeUndefined()
  })
})
