import {getCommunityFeedUri} from '../community-post'

const post = (communityFeed?: unknown) =>
  ({
    uri: 'at://did:plc:author/community.blacksky.feed.post/3m2post',
    communityFeed,
  }) as never

describe(getCommunityFeedUri, () => {
  it('accepts a feed generator URI', () => {
    const feed =
      'at://did:plc:community/app.bsky.feed.generator/3m2communityfeed'

    expect(getCommunityFeedUri(post(feed))).toBe(feed)
  })

  it.each([
    undefined,
    42,
    'not-an-at-uri',
    'at://did:plc:community/community.blacksky.feed.config/3m2communityfeed',
  ])('rejects absent or invalid feed context: %p', communityFeed => {
    expect(getCommunityFeedUri(post(communityFeed))).toBeUndefined()
  })
})
