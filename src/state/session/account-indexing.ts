import {timeout} from '#/lib/async/timeout'
import {logger} from '#/logger'

// Delays (ms) before each poll attempt. ~23s total across 6 attempts before we
// decide the appview never indexed the account and trigger the self-heal.
const REINDEX_POLL_DELAYS_MS = [0, 1000, 2000, 4000, 8000, 8000]
// Shorter poll after the repair, just to confirm and log the outcome.
const REINDEX_CONFIRM_DELAYS_MS = [1000, 2000, 4000]

export type AccountIndexingOps = {
  /** Rejects while the appview has no profile for the account. */
  getProfile: () => Promise<unknown>
  /** The live session's handle, read at repair time. */
  getHandle: () => string | undefined
  updateHandle: (handle: string) => Promise<unknown>
}

async function isProfileIndexed(ops: AccountIndexingOps) {
  try {
    await ops.getProfile()
    return true
  } catch {
    // Any failure — actor-not-found or a transient network error — is treated
    // as "not indexed". Over-triggering is harmless: the repair is a no-op.
    return false
  }
}

async function pollForIndexing(ops: AccountIndexingOps, delaysMs: number[]) {
  for (const delay of delaysMs) {
    if (delay > 0) {
      await timeout(delay)
    }
    if (await isProfileIndexed(ops)) {
      return true
    }
  }
  return false
}

/**
 * On account creation the appview sometimes misses the new-account event and
 * never indexes the account, so the profile never resolves. Calling
 * `updateHandle` with the user's *current* handle is a no-op at the PDS but
 * re-emits a `#identity` event on the firehose, which the appview indexer then
 * catches and back-fills the account.
 *
 * This best-effort self-heal polls for the profile and, only if it never shows
 * up, fires that no-op. It reads the handle fresh from the live session at
 * repair time (never a captured value) so it re-emits whatever the current
 * handle is rather than reverting a handle the user changed in the meantime.
 *
 * Fire-and-forget: it never throws and never blocks onboarding.
 */
export async function verifyAndRepairAccountIndexing(
  ops: AccountIndexingOps,
  {
    pollDelaysMs = REINDEX_POLL_DELAYS_MS,
    confirmDelaysMs = REINDEX_CONFIRM_DELAYS_MS,
  }: {pollDelaysMs?: number[]; confirmDelaysMs?: number[]} = {},
): Promise<void> {
  try {
    if (await pollForIndexing(ops, pollDelaysMs)) {
      return
    }

    // Read the handle fresh at repair time to avoid clobbering a change made
    // during the poll window.
    const handle = ops.getHandle()
    if (!handle) {
      logger.warn(
        `verifyAndRepairAccountIndexing: no active session handle, skipping repair`,
      )
      return
    }

    logger.warn(
      `verifyAndRepairAccountIndexing: profile not indexed, re-emitting identity via updateHandle`,
    )
    try {
      await ops.updateHandle(handle)
    } catch (e) {
      logger.error(e instanceof Error ? e : String(e), {
        message: `verifyAndRepairAccountIndexing: updateHandle re-emit failed`,
      })
      return
    }

    const recovered = await pollForIndexing(ops, confirmDelaysMs)
    if (recovered) {
      logger.info(`verifyAndRepairAccountIndexing: appview indexing recovered`)
    } else {
      logger.error(
        `verifyAndRepairAccountIndexing: profile still not indexed after re-emit`,
      )
    }
  } catch (e) {
    // Best-effort: never let a self-heal failure surface to signup/onboarding.
    logger.error(e instanceof Error ? e : String(e), {
      message: `verifyAndRepairAccountIndexing: unexpected error`,
    })
  }
}
