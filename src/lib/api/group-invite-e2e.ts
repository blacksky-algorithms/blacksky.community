export type GroupInviteE2EFailureStage =
  | 'saved-feed-update'
  | 'saved-feed-add'
  | 'navigation'

/** Production builds never inject client-side failures. */
export function setGroupInviteE2EFailure(
  _stage: GroupInviteE2EFailureStage,
): void {}

export function maybeFailGroupInviteE2E(
  _stage: GroupInviteE2EFailureStage,
): void {}

export function isGroupInviteE2EFailure(
  _error: unknown,
  _stage: GroupInviteE2EFailureStage,
): boolean {
  return false
}
