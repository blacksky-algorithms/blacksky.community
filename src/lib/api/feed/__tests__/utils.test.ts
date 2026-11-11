import {Platform} from 'react-native'
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {BSKY_FEED_OWNER_DIDS, DISCOVER_FEED_URI} from '#/lib/constants'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences'
import {device} from '#/storage'

jest.mock('#/env', () => ({IS_WEB: false}))
jest.mock('#/storage', () => ({device: {get: jest.fn()}}))

import {
  aggregateUserInterests,
  createBskyFeedHeaders,
  createBskyTopicsHeader,
} from '../utils'

beforeEach(() => {
  jest.mocked(device.get).mockReset()
  jest.replaceProperty(Platform, 'OS', 'ios')
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('createBskyFeedHeaders', () => {
  it.each(['web', 'ios', 'android'] as const)(
    'sends the %s platform',
    platform => {
      jest.replaceProperty(Platform, 'OS', platform)
      expect(createBskyFeedHeaders(DISCOVER_FEED_URI)).toEqual({
        'x-atproto-bsky-platform': platform,
      })
    },
  )

  it.each(BSKY_FEED_OWNER_DIDS)(
    'sends the platform and no location to feeds owned by %s',
    did => {
      jest.mocked(device.get).mockReturnValue({
        countryCode: 'JP',
        regionCode: '13',
        city: '東京',
        ip: '2001:db8::1',
      } as never)

      expect(
        createBskyFeedHeaders(`at://${did}/app.bsky.feed.generator/test`),
      ).toEqual({'x-atproto-bsky-platform': 'ios'})
      expect(device.get).not.toHaveBeenCalled()
    },
  )

  it('does not send platform or read location for third-party feeds', () => {
    expect(
      createBskyFeedHeaders(
        'at://did:example:feed/app.bsky.feed.generator/test',
      ),
    ).toEqual({})
    expect(device.get).not.toHaveBeenCalled()
  })
})

function preferences(
  interests: Pick<
    UsePreferencesQueryResponse['interests'],
    'tags' | 'updatedAt'
  >,
) {
  return {interests} as UsePreferencesQueryResponse
}

describe('aggregateUserInterests', () => {
  it('appends the update timestamp after a semicolon', () => {
    expect(
      createBskyTopicsHeader(
        aggregateUserInterests(
          preferences({
            tags: ['animals', 'music'],
            updatedAt: '2026-09-03T17:00:00.000Z',
          }),
        ),
      ),
    ).toEqual({
      'x-atproto-bsky-topics': 'animals,music;2026-09-03T17:00:00.000Z',
    })
  })

  it('supports interests created before update timestamps were recorded', () => {
    expect(aggregateUserInterests(preferences({tags: ['animals']}))).toBe(
      'animals',
    )
  })

  it('passes the timestamp when the user has no selected interests', () => {
    expect(
      aggregateUserInterests(
        preferences({
          tags: [],
          updatedAt: '2026-09-03T17:00:00.000Z',
        }),
      ),
    ).toBe(';2026-09-03T17:00:00.000Z')
  })
})
