import {BSKY_SERVICE, FOR_YOU_FEED_URI} from '#/lib/constants'
import {prioritizeForYouForBlackskyPds} from '#/lib/default-feeds'

const defaults = [
  {
    type: 'feed',
    value: 'at://did:plc:example/app.bsky.feed.generator/trending',
    pinned: true,
  },
  {type: 'timeline', value: 'following', pinned: true},
]

describe('prioritizeForYouForBlackskyPds', () => {
  it('pins For You first for accounts on the Blacksky PDS', () => {
    expect(prioritizeForYouForBlackskyPds(defaults, BSKY_SERVICE)).toEqual([
      {type: 'feed', value: FOR_YOU_FEED_URI, pinned: true},
      ...defaults,
    ])
  })

  it('moves an existing For You feed first without duplicating it', () => {
    expect(
      prioritizeForYouForBlackskyPds(
        [...defaults, {type: 'feed', value: FOR_YOU_FEED_URI, pinned: false}],
        BSKY_SERVICE,
      ),
    ).toEqual([
      {type: 'feed', value: FOR_YOU_FEED_URI, pinned: true},
      ...defaults,
    ])
  })

  it('accepts the normalized Blacksky PDS URL', () => {
    expect(
      prioritizeForYouForBlackskyPds(defaults, `${BSKY_SERVICE}/`)[0],
    ).toEqual({type: 'feed', value: FOR_YOU_FEED_URI, pinned: true})
  })

  it('leaves accounts on other PDSes unchanged', () => {
    expect(
      prioritizeForYouForBlackskyPds(defaults, 'https://pds.example.com'),
    ).toBe(defaults)
  })
})
