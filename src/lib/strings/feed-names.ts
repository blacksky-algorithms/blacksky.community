import {type I18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'

import {TIMELINE_SAVED_FEED} from '#/lib/constants'

type FeedNameSource = {
  displayName: string
  uri: string
}

export function getLocalizedFeedName(feed: FeedNameSource, i18n: I18n): string {
  if (feed.uri === TIMELINE_SAVED_FEED.value) {
    return i18n._(msg({message: 'Following', context: 'feed-name'}))
  }
  // The default feed keeps the name on its own record; it is not renamed here.
  return feed.displayName
}
