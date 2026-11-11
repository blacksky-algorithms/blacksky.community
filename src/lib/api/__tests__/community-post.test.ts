// The repo-wide stub of this module rejects the CID in a legacy blob reference.
jest.unmock('multiformats/cid')

import {
  getCommunitySpaceUri,
  isPeerModLabelableUri,
  isRenderablePostRecord,
} from '../community-post'

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

describe(isPeerModLabelableUri, () => {
  it.each([
    'at://did:plc:a/app.bsky.feed.post/3k',
    'at://did:plc:a/community.blacksky.feed.post/3k',
  ])('accepts %s', uri => {
    expect(isPeerModLabelableUri(uri)).toBe(true)
  })

  it.each([
    'at://did:plc:a/app.bsky.feed.generator/3k',
    'at://did:plc:a/app.bsky.feed.repost/3k',
    'at://did:plc:c/space/community.blacksky.feed/main/did:plc:a/app.bsky.feed.post/3k',
  ])('rejects %s', uri => {
    expect(isPeerModLabelableUri(uri)).toBe(false)
  })
})

describe(isRenderablePostRecord, () => {
  const view = (record: unknown) =>
    ({uri: 'at://did:plc:author/app.bsky.feed.post/3m2post', record}) as never

  it('accepts a public post that still holds a legacy image reference', () => {
    expect(
      isRenderablePostRecord(
        view({
          $type: 'app.bsky.feed.post',
          text: 'hello',
          createdAt: '2023-01-01T00:00:00.000Z',
          embed: {
            $type: 'app.bsky.embed.images',
            images: [
              {
                image: {
                  cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
                  mimeType: 'image/jpeg',
                },
                alt: '',
              },
            ],
          },
        }),
      ),
    ).toBe(true)
  })

  it('rejects a public post record that is missing required fields', () => {
    expect(
      isRenderablePostRecord(
        view({$type: 'app.bsky.feed.post', text: 'hello'}),
      ),
    ).toBe(false)
  })
})
