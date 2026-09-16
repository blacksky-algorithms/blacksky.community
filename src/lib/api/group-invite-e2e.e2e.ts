type GroupInviteE2EFailureStage =
  | 'saved-feed-update'
  | 'saved-feed-add'
  | 'navigation'

let pendingFailure: GroupInviteE2EFailureStage | undefined

class GroupInviteE2EInjectedFailure extends Error {
  readonly stage: GroupInviteE2EFailureStage

  constructor(stage: GroupInviteE2EFailureStage) {
    super(`Injected group invite E2E failure: ${stage}`)
    this.name = 'GroupInviteE2EInjectedFailure'
    this.stage = stage
  }
}

export function setGroupInviteE2EFailure(stage: GroupInviteE2EFailureStage) {
  pendingFailure = stage
}

export function maybeFailGroupInviteE2E(stage: GroupInviteE2EFailureStage) {
  if (pendingFailure !== stage) return
  pendingFailure = undefined
  throw new GroupInviteE2EInjectedFailure(stage)
}

export function isGroupInviteE2EFailure(
  error: unknown,
  stage: GroupInviteE2EFailureStage,
) {
  return error instanceof GroupInviteE2EInjectedFailure && error.stage === stage
}
