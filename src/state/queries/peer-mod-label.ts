import {type BskyAgent} from '@atproto/api'
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {communityXrpc} from '#/lib/api/community'
import {timeout} from '#/lib/async/timeout'
import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {logger} from '#/logger'
import {
  COMMUNITY_POST_RQKEY,
  RQKEY_ROOT as COMMUNITY_FEED_RQKEY_ROOT,
  TIMELINE_RQKEY,
} from '#/state/queries/community-feed'
import {RQKEY as postRQKey} from '#/state/queries/post'
import {RQKEY_ROOT as POST_FEED_RQKEY_ROOT} from '#/state/queries/post-feed'
import {postThreadQueryKeyRoot} from '#/state/queries/usePostThread/types'
import {useAgent} from '#/state/session'
import {BLACKSKY_LABELER} from '#/state/session/additional-moderation-authorities'

const APPLY_METHOD = 'community.blacksky.moderation.applyLabel'
const REMOVE_METHOD = 'community.blacksky.moderation.removeLabel'
const GET_MY_LABELS_METHOD = 'community.blacksky.moderation.getMyLabels'

const RECONCILE_ATTEMPTS = 8
const RECONCILE_INTERVAL_MS = 750
const RECONCILE_REQUEST_TIMEOUT_MS = 3000

export type ApplyLabelInput = {
  subjectUri: string
  subjectCid: string
  val: string
  reason?: string
}

export type RemoveLabelInput = {
  subjectUri: string
  val: string
}

const MY_LABELS_RQKEY_ROOT = 'peer-mod-my-labels'
export const myLabelsRQKey = (subjectUri: string) => [
  MY_LABELS_RQKEY_ROOT,
  subjectUri,
]

const POST_LABELS_RQKEY_ROOT = 'peer-mod-post-labels'
export const postLabelsRQKey = (subjectUri: string) => [
  POST_LABELS_RQKEY_ROOT,
  subjectUri,
]

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {message?: string}
  return body.message || `${res.status}`
}

/**
 * Labels the current peer mod has applied to a given post, used to gate the
 * remove affordance and reflect already-applied state. Peer mods can only
 * remove labels they applied themselves.
 */
export function useMyAppliedLabelsQuery(subjectUri: string | undefined) {
  const agent = useAgent()
  return useQuery<string[]>({
    queryKey: myLabelsRQKey(subjectUri || ''),
    enabled: !!subjectUri,
    queryFn: async () => {
      if (!subjectUri) return []
      try {
        const res = await communityXrpc(agent, GET_MY_LABELS_METHOD, {
          params: {subjectUri},
        })
        if (!res.ok) return []
        const data = (await res.json()) as {vals?: string[]}
        return data.vals ?? []
      } catch {
        // Backend may not be reachable yet; treat as "none applied by me".
        return []
      }
    },
  })
}

/**
 * Blacksky labels currently present on a post (from any source), used to show
 * already-applied state and prevent double-application.
 */
export function usePostBlackskyLabelsQuery(subjectUri: string | undefined) {
  const agent = useAgent()
  return useQuery<string[]>({
    queryKey: postLabelsRQKey(subjectUri || ''),
    enabled: !!subjectUri,
    queryFn: async () => {
      if (!subjectUri) return []
      return fetchBlackskyLabelVals(agent, subjectUri)
    },
  })
}

async function fetchBlackskyLabelVals(
  agent: BskyAgent,
  subjectUri: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await agent.com.atproto.label.queryLabels(
    {uriPatterns: [subjectUri], sources: [BLACKSKY_LABELER]},
    {...HOME_APPVIEW_PINNED_OPTS, signal},
  )
  return res.data.labels.filter(l => !l.neg).map(l => l.val)
}

function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([run(controller.signal), deadline]).finally(() =>
    clearTimeout(timer),
  )
}

/**
 * Ozone accepting a label event does not mean the appview has ingested it
 * yet, so the caches that render this post are refreshed once the appview
 * reports the expected state, or after a bounded wait.
 */
export async function reconcileLabelState({
  agent,
  queryClient,
  subjectUri,
  val,
  expectPresent,
}: {
  agent: BskyAgent
  queryClient: QueryClient
  subjectUri: string
  val: string
  expectPresent: boolean
}): Promise<void> {
  let converged = false
  try {
    for (let attempt = 1; attempt <= RECONCILE_ATTEMPTS; attempt++) {
      try {
        const vals = await withDeadline(
          signal => fetchBlackskyLabelVals(agent, subjectUri, signal),
          RECONCILE_REQUEST_TIMEOUT_MS,
        )
        if (vals.includes(val) === expectPresent) {
          converged = true
          break
        }
      } catch (e) {
        logger.warn('peer-mod label reconcile attempt failed', {
          attempt,
          subjectUri,
          val,
          message: e instanceof Error ? e.message : String(e),
        })
      }
      if (attempt < RECONCILE_ATTEMPTS) {
        await timeout(RECONCILE_INTERVAL_MS)
      }
    }
  } finally {
    if (!converged) {
      logger.warn('peer-mod label reconcile did not converge', {
        subjectUri,
        val,
        expectPresent,
      })
    }
    invalidateLabelState(queryClient, subjectUri)
  }
}

export function useApplyLabelMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<void, Error, ApplyLabelInput>({
    mutationFn: async input => {
      const res = await communityXrpc(agent, APPLY_METHOD, {body: input})
      if (!res.ok) {
        throw new Error(await readError(res))
      }
    },
    onSuccess: (_data, input) => {
      void reconcileLabelState({
        agent,
        queryClient,
        subjectUri: input.subjectUri,
        val: input.val,
        expectPresent: true,
      })
    },
  })
}

export function useRemoveLabelMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<void, Error, RemoveLabelInput>({
    mutationFn: async input => {
      const res = await communityXrpc(agent, REMOVE_METHOD, {body: input})
      if (!res.ok) {
        throw new Error(await readError(res))
      }
    },
    onSuccess: (_data, input) => {
      void reconcileLabelState({
        agent,
        queryClient,
        subjectUri: input.subjectUri,
        val: input.val,
        expectPresent: false,
      })
    },
  })
}

function invalidateLabelState(queryClient: QueryClient, subjectUri: string) {
  for (const queryKey of [
    myLabelsRQKey(subjectUri),
    postLabelsRQKey(subjectUri),
    COMMUNITY_POST_RQKEY(subjectUri),
    postRQKey(subjectUri),
    TIMELINE_RQKEY(),
    [COMMUNITY_FEED_RQKEY_ROOT],
    [POST_FEED_RQKEY_ROOT],
    [postThreadQueryKeyRoot],
  ]) {
    void queryClient.invalidateQueries({queryKey})
  }
}
