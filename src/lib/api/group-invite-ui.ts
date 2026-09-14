import {type AppBskyActorDefs} from '@atproto/api'

import {
  GroupInviteClientError,
  GroupInviteError,
  type GroupInviteFeed,
} from './group-invites'

const openedGroupInviteCodes = new Set<string>()
const MAX_TRACKED_GROUP_INVITES = 1_000

export function shouldTrackGroupInviteOpened(code: string) {
  if (openedGroupInviteCodes.has(code)) return false
  if (openedGroupInviteCodes.size >= MAX_TRACKED_GROUP_INVITES) {
    const oldest = openedGroupInviteCodes.values().next().value
    if (oldest) openedGroupInviteCodes.delete(oldest)
  }
  openedGroupInviteCodes.add(code)
  return true
}

export function groupInviteErrorCopy(error: unknown): string {
  const code =
    error instanceof GroupInviteClientError
      ? error.code
      : GroupInviteError.AuthorizationUnavailable
  switch (code) {
    case GroupInviteError.InviteUnavailable:
      return 'This invite is no longer available.'
    case GroupInviteError.GroupAtCapacity:
      return 'This group is currently at capacity.'
    case GroupInviteError.RateLimitExceeded:
      return 'Too many attempts. Please try again shortly.'
    case GroupInviteError.AuthenticationRequired:
      return 'Please sign in again to accept this invite.'
    case GroupInviteError.InviteMisconfigured:
      return 'This invite is temporarily unavailable.'
    case GroupInviteError.AuthorizationUnavailable:
    default:
      return 'We could not contact the group service. Please try again.'
  }
}

export function summarizeGroupInviteFeeds(feeds: GroupInviteFeed[]) {
  const readable = feeds.filter(feed => feed.canView)
  return {
    readable,
    postable: readable.filter(feed => feed.canPost),
    readOnly: readable.filter(feed => !feed.canPost),
  }
}

export function getDefaultGroupInviteFeedUris(feeds: GroupInviteFeed[]) {
  return feeds
    .filter(feed => feed.canView && Boolean(feed.uri))
    .map(feed => feed.uri)
}

export function getFirstSelectedGroupInviteFeed(
  feeds: GroupInviteFeed[],
  selectedUris: ReadonlySet<string>,
) {
  const selected = feeds.filter(
    feed => feed.canView && Boolean(feed.uri) && selectedUris.has(feed.uri),
  )
  return selected.find(feed => feed.canPost) ?? selected[0]
}

export function shouldOpenGroupInviteFeedAfterPinning(
  feeds: GroupInviteFeed[],
  selectedUris: ReadonlySet<string>,
) {
  return Boolean(getFirstSelectedGroupInviteFeed(feeds, selectedUris))
}

export function getGroupInviteMembershipCopy(feeds: GroupInviteFeed[]) {
  const {readable, postable} = summarizeGroupInviteFeeds(feeds)
  if (readable.length === 0) return 'No feeds available.'
  if (postable.length === 0) return getGroupInviteNoPostCopy()
  return undefined
}

export function getGroupInviteNoPostCopy() {
  return "You joined the group, but you don't currently have access to a feed you can post in. Please let your admins know if you think this is a mistake."
}

export function shouldResetGroupInvitePinning(
  previousUris: string[],
  nextUris: string[],
) {
  return (
    previousUris.length !== nextUris.length ||
    previousUris.some(uri => !nextUris.includes(uri))
  )
}

export function groupInviteFailureName(error: unknown) {
  return error instanceof GroupInviteClientError ? error.code : 'Unknown'
}

export function getGroupInviteFeedMutations(
  feeds: GroupInviteFeed[],
  savedFeeds: AppBskyActorDefs.SavedFeed[] = [],
  selectedUris?: ReadonlySet<string>,
) {
  const savedByValue = new Map(savedFeeds.map(feed => [feed.value, feed]))
  const readable = feeds.filter(
    feed =>
      feed.canView &&
      Boolean(feed.uri) &&
      (selectedUris === undefined || selectedUris.has(feed.uri)),
  )
  return {
    toAdd: readable
      .filter(feed => !savedByValue.has(feed.uri))
      .map(feed => ({type: 'feed' as const, value: feed.uri, pinned: true})),
    toUpdate: readable
      .map(feed => savedByValue.get(feed.uri))
      .filter((feed): feed is AppBskyActorDefs.SavedFeed =>
        Boolean(feed && !feed.pinned),
      )
      .map(feed => ({...feed, pinned: true})),
  }
}
