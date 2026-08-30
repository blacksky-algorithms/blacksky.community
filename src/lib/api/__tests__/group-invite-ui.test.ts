import {describe, expect, it} from '@jest/globals'

import {
  getDefaultGroupInviteFeedUris,
  getFirstSelectedGroupInviteFeed,
  getGroupInviteFeedMutations,
  getGroupInviteMembershipCopy,
  getGroupInviteNoPostCopy,
  groupInviteErrorCopy,
  groupInviteFailureName,
  shouldOpenGroupInviteFeedAfterPinning,
  shouldResetGroupInvitePinning,
  shouldTrackGroupInviteOpened,
  summarizeGroupInviteFeeds,
} from '../group-invite-ui'
import {GroupInviteClientError, GroupInviteError} from '../group-invites'

describe('group invite UI state', () => {
  it('uses friendly stable copy for backend failures', () => {
    expect(
      groupInviteErrorCopy(
        new GroupInviteClientError(GroupInviteError.InviteUnavailable),
      ),
    ).toBe('This invite is no longer available.')
    expect(groupInviteErrorCopy(new Error('database password'))).not.toContain(
      'database password',
    )
  })

  it('separates readable postable and read-only feeds', () => {
    const result = summarizeGroupInviteFeeds([
      {uri: 'at://feed/post', name: 'Post', canView: true, canPost: true},
      {uri: 'at://feed/read', name: 'Read', canView: true, canPost: false},
      {uri: 'at://feed/hidden', name: 'Hidden', canView: false, canPost: false},
    ])
    expect(result.postable.map(feed => feed.uri)).toEqual(['at://feed/post'])
    expect(result.readOnly.map(feed => feed.uri)).toEqual(['at://feed/read'])
    expect(result.readable).not.toContainEqual(
      expect.objectContaining({uri: 'at://feed/hidden'}),
    )
  })

  it('pins missing and previously saved-but-unpinned feeds without duplicating pinned feeds', () => {
    const result = getGroupInviteFeedMutations(
      [
        {
          uri: 'at://feed/missing',
          name: 'Missing',
          canView: true,
          canPost: true,
        },
        {uri: 'at://feed/pinned', name: 'Pinned', canView: true, canPost: true},
        {
          uri: 'at://feed/unpinned',
          name: 'Unpinned',
          canView: true,
          canPost: false,
        },
        {
          uri: 'at://feed/hidden',
          name: 'Hidden',
          canView: false,
          canPost: true,
        },
      ],
      [
        {id: '1', type: 'feed', value: 'at://feed/pinned', pinned: true},
        {id: '2', type: 'feed', value: 'at://feed/unpinned', pinned: false},
      ],
    )
    expect(result.toAdd).toEqual([
      {type: 'feed', value: 'at://feed/missing', pinned: true},
    ])
    expect(result.toUpdate).toEqual([
      {id: '2', type: 'feed', value: 'at://feed/unpinned', pinned: true},
    ])
  })

  it('defaults selection to accessible feeds and never includes hidden feeds', () => {
    expect(
      getDefaultGroupInviteFeedUris([
        {uri: 'at://feed/post', name: 'Post', canView: true, canPost: true},
        {uri: 'at://feed/read', name: 'Read', canView: true, canPost: false},
        {
          uri: 'at://feed/hidden',
          name: 'Hidden',
          canView: false,
          canPost: true,
        },
      ]),
    ).toEqual(['at://feed/post', 'at://feed/read'])
  })

  it('selects the first postable feed before an earlier readable fallback', () => {
    const feeds = [
      {uri: 'at://feed/read', name: 'Read', canView: true, canPost: false},
      {uri: 'at://feed/post', name: 'Post', canView: true, canPost: true},
    ]
    expect(
      getFirstSelectedGroupInviteFeed(
        feeds,
        new Set(['at://feed/read', 'at://feed/post']),
      )?.uri,
    ).toBe('at://feed/post')
    expect(
      getFirstSelectedGroupInviteFeed(feeds, new Set(['at://feed/read']))?.uri,
    ).toBe('at://feed/read')
  })

  it('opens a selected read-only feed after pinning when no postable feed is selected', () => {
    expect(
      shouldOpenGroupInviteFeedAfterPinning(
        [
          {uri: 'at://feed/read', name: 'Read', canView: true, canPost: false},
          {
            uri: 'at://feed/hidden',
            name: 'Hidden',
            canView: false,
            canPost: false,
          },
        ],
        new Set(['at://feed/read']),
      ),
    ).toBe(true)
  })

  it('pins only selected accessible feeds', () => {
    const result = getGroupInviteFeedMutations(
      [
        {
          uri: 'at://feed/selected',
          name: 'Selected',
          canView: true,
          canPost: true,
        },
        {uri: 'at://feed/other', name: 'Other', canView: true, canPost: false},
        {
          uri: 'at://feed/hidden',
          name: 'Hidden',
          canView: false,
          canPost: true,
        },
      ],
      [],
      new Set(['at://feed/selected']),
    )
    expect(result.toAdd).toEqual([
      {type: 'feed', value: 'at://feed/selected', pinned: true},
    ])
  })

  it('uses the required membership copy for no-post and no-readable outcomes', () => {
    expect(
      getGroupInviteMembershipCopy([
        {uri: 'at://feed/read', name: 'Read', canView: true, canPost: false},
      ]),
    ).toBe(
      "You joined the group, but you don't currently have access to a feed you can post in. Please let your admins know if you think this is a mistake.",
    )
    expect(
      getGroupInviteMembershipCopy([
        {
          uri: 'at://feed/hidden',
          name: 'Hidden',
          canView: false,
          canPost: false,
        },
      ]),
    ).toBe('No feeds available.')
    expect(getGroupInviteNoPostCopy()).toContain(
      'Please let your admins know if you think this is a mistake.',
    )
  })

  it('invalidates completed pinning when feed selection changes', () => {
    expect(
      shouldResetGroupInvitePinning(['at://feed/one'], ['at://feed/one']),
    ).toBe(false)
    expect(
      shouldResetGroupInvitePinning(['at://feed/one'], ['at://feed/two']),
    ).toBe(true)
  })

  it('returns only stable failure names for analytics', () => {
    expect(
      groupInviteFailureName(
        new GroupInviteClientError(GroupInviteError.InviteMisconfigured),
      ),
    ).toBe('InviteMisconfigured')
    expect(groupInviteFailureName(new Error('invite-code-secret'))).toBe(
      'Unknown',
    )
  })

  it('deduplicates opened analytics for the same invite', () => {
    const code = `analytics-${Date.now()}-${Math.random()}`
    expect(shouldTrackGroupInviteOpened(code)).toBe(true)
    expect(shouldTrackGroupInviteOpened(code)).toBe(false)
  })
})
