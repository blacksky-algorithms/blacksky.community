import {describe, expect, it} from '@jest/globals'

import {
  getDeepLinkAnalyticsTarget,
  getDeepLinkDestinationKind,
  shouldHandleIncomingIntentUrl,
} from '../url-helpers'

const URL = 'https://bsky.app/join/' + 'a'.repeat(43)

describe('incoming intent URL handling', () => {
  it('reopens the same group invite for a new warm-app link event', () => {
    expect(shouldHandleIncomingIntentUrl(URL, URL, true)).toBe(true)
    expect(shouldHandleIncomingIntentUrl(URL, URL, false)).toBe(false)
  })

  it('continues deduplicating repeated non-invite URLs', () => {
    const url = 'https://bsky.app/profile/alice'
    expect(shouldHandleIncomingIntentUrl(url, url, true)).toBe(false)
  })

  it('removes group invite bearer codes from analytics targets', () => {
    expect(getDeepLinkAnalyticsTarget(URL)).toBe('group-invite')
    expect(getDeepLinkAnalyticsTarget('https://bsky.app/profile/alice')).toBe(
      'https://bsky.app/profile/alice',
    )
  })
})

describe('getDeepLinkDestinationKind', () => {
  it('classifies links by coarse destination', () => {
    expect(
      getDeepLinkDestinationKind('https://bsky.app/profile/alice/post/3k'),
    ).toBe('post')
    expect(
      getDeepLinkDestinationKind('blacksky://profile/alice/post/3k?ref=x'),
    ).toBe('post')
    expect(getDeepLinkDestinationKind('https://bsky.app/profile/alice')).toBe(
      'profile',
    )
    expect(getDeepLinkDestinationKind('https://bsky.app/start/alice/3k')).toBe(
      'starterPack',
    )
    expect(
      getDeepLinkDestinationKind('https://bsky.app/starter-pack/alice/3k'),
    ).toBe('starterPack')
    expect(getDeepLinkDestinationKind('https://bsky.app/event/alice/3k')).toBe(
      'event',
    )
    expect(getDeepLinkDestinationKind('https://bsky.app/notifications')).toBe(
      'other',
    )
    expect(getDeepLinkDestinationKind('not a url')).toBe('other')
  })
})
