import {isCommunityPostUri} from '../community-post'

const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'

describe(isCommunityPostUri, () => {
  it.each([
    ['a stub post', 'at://did:plc:alice/community.blacksky.feed.post/3kabc'],
    ['a space post', `${SPACE}/did:plc:alice/app.bsky.feed.post/3kabc`],
    ['a space like', `${SPACE}/did:plc:alice/app.bsky.feed.like/3klike`],
  ])('treats %s as community content', (_name, uri) => {
    expect(isCommunityPostUri(uri)).toBe(true)
  })

  it.each([undefined, 'at://did:plc:alice/app.bsky.feed.post/3kabc', SPACE])(
    'leaves public content alone: %p',
    uri => {
      expect(isCommunityPostUri(uri)).toBe(false)
    },
  )
})
