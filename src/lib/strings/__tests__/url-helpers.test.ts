import {describe, expect, it} from '@jest/globals'

import {
  getDeepLinkAnalyticsTarget,
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
