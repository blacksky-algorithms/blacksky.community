import {BSKY_SERVICE, FOR_YOU_FEED_URI} from '#/lib/constants'

export type DefaultPinnedFeed = {
  type: string
  value: string
  pinned: boolean
}

export function prioritizeForYouForBlackskyPds(
  feeds: DefaultPinnedFeed[],
  service?: string,
): DefaultPinnedFeed[] {
  if (!service || new URL(service).origin !== new URL(BSKY_SERVICE).origin) {
    return feeds
  }

  const existing = feeds.find(
    feed => feed.type === 'feed' && feed.value === FOR_YOU_FEED_URI,
  )

  return [
    existing
      ? {...existing, pinned: true}
      : {type: 'feed', value: FOR_YOU_FEED_URI, pinned: true},
    ...feeds.filter(
      feed => !(feed.type === 'feed' && feed.value === FOR_YOU_FEED_URI),
    ),
  ]
}
