import {type I18n} from '@lingui/core'

import {DISCOVER_FEED_URI, TIMELINE_SAVED_FEED} from '#/lib/constants'
import {getLocalizedFeedName} from '../feed-names'

const i18n = {
  _: (descriptor: {message?: string}) => descriptor.message ?? '',
} as unknown as I18n

describe('getLocalizedFeedName', () => {
  it('keeps the default feed under its own name', () => {
    expect(
      getLocalizedFeedName(
        {displayName: 'Blacksky: Trending', uri: DISCOVER_FEED_URI},
        i18n,
      ),
    ).toBe('Blacksky: Trending')
  })

  it('localizes the Following timeline', () => {
    expect(
      getLocalizedFeedName(
        {displayName: 'Timeline', uri: TIMELINE_SAVED_FEED.value},
        i18n,
      ),
    ).toBe('Following')
  })
})
