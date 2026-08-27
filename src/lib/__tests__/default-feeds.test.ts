import {FOR_YOU_FEED_URI} from '#/lib/constants'
import {prioritizeForYouForMyAtprotoHandle} from '#/lib/default-feeds'

const defaults = [
  {
    type: 'feed',
    value: 'at://did:plc:example/app.bsky.feed.generator/trending',
    pinned: true,
  },
  {type: 'timeline', value: 'following', pinned: true},
]

describe('prioritizeForYouForMyAtprotoHandle', () => {
  it('pins For You first for myatproto.social handles', () => {
    expect(
      prioritizeForYouForMyAtprotoHandle(defaults, 'alice.myatproto.social'),
    ).toEqual([
      {type: 'feed', value: FOR_YOU_FEED_URI, pinned: true},
      ...defaults,
    ])
  })

  it('moves an existing For You feed first without duplicating it', () => {
    expect(
      prioritizeForYouForMyAtprotoHandle(
        [...defaults, {type: 'feed', value: FOR_YOU_FEED_URI, pinned: false}],
        'alice.myatproto.social',
      ),
    ).toEqual([
      {type: 'feed', value: FOR_YOU_FEED_URI, pinned: true},
      ...defaults,
    ])
  })

  it('matches the handle domain case-insensitively', () => {
    expect(
      prioritizeForYouForMyAtprotoHandle(defaults, 'Alice.MyAtproto.Social')[0],
    ).toEqual({type: 'feed', value: FOR_YOU_FEED_URI, pinned: true})
  })

  it('leaves other handle domains unchanged', () => {
    expect(
      prioritizeForYouForMyAtprotoHandle(defaults, 'alice.blacksky.app'),
    ).toBe(defaults)
  })
})
