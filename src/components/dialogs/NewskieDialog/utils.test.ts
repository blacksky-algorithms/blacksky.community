import {beforeAll, describe, expect, it} from '@jest/globals'
import {i18n} from '@lingui/core'

import {getJoinMessage} from './utils'

beforeAll(() => {
  i18n.loadAndActivate({locale: 'en', messages: {}})
})

const now = Date.parse('2026-09-01T12:00:00.000Z')

describe('NewskieDialog getJoinMessage', () => {
  it.each([
    {
      isMe: true,
      joinedViaStarterPack: false,
      expected: 'You joined Blacksky just now',
    },
    {
      isMe: true,
      joinedViaStarterPack: true,
      expected: 'You joined Blacksky using a starter pack just now',
    },
    {
      isMe: false,
      joinedViaStarterPack: false,
      expected: 'Alice joined Blacksky just now',
    },
    {
      isMe: false,
      joinedViaStarterPack: true,
      expected: 'Alice joined Blacksky using a starter pack just now',
    },
  ])('$expected', ({isMe, joinedViaStarterPack, expected}) => {
    expect(
      getJoinMessage({
        i18n,
        profileName: 'Alice',
        isMe,
        joinedViaStarterPack,
        createdAt: new Date(now - 4_000).toISOString(),
        now,
      }),
    ).toBe(expected)
  })

  it.each([
    {
      isMe: true,
      joinedViaStarterPack: false,
      expected: 'You joined Blacksky 5 seconds ago',
    },
    {
      isMe: true,
      joinedViaStarterPack: true,
      expected: 'You joined Blacksky using a starter pack 5 seconds ago',
    },
    {
      isMe: false,
      joinedViaStarterPack: false,
      expected: 'Alice joined Blacksky 5 seconds ago',
    },
    {
      isMe: false,
      joinedViaStarterPack: true,
      expected: 'Alice joined Blacksky using a starter pack 5 seconds ago',
    },
  ])('$expected', ({isMe, joinedViaStarterPack, expected}) => {
    expect(
      getJoinMessage({
        i18n,
        profileName: 'Alice',
        isMe,
        joinedViaStarterPack,
        createdAt: new Date(now - 5_000).toISOString(),
        now,
      }),
    ).toBe(expected)
  })

  it('treats a future timestamp as just now', () => {
    expect(
      getJoinMessage({
        i18n,
        profileName: 'Alice',
        isMe: true,
        joinedViaStarterPack: false,
        createdAt: new Date(now + 60_000).toISOString(),
        now,
      }),
    ).toBe('You joined Blacksky just now')
  })
})
