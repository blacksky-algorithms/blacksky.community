import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {logger} from '#/logger'
import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'

import {POST_TYPE_FILTER_NSID, type PostTypeFiltersRecord} from './types'

const RQKEY_ROOT = 'post-type-filters'

export const RQKEY = (did: string | undefined) => [
  RQKEY_ROOT,
  did ?? '<no-account>',
]

export type UpdateOp =
  | {op: 'add'; subject: string; type: string}
  | {op: 'remove'; subject: string; type: string}

function isRecordNotFoundError(e: unknown): boolean {
  if (e instanceof Error) {
    return e.message.includes('Could not locate record:')
  }
  return false
}

export function usePostTypeFiltersQuery() {
  const {currentAccount} = useSession()
  const agent = useAgent()

  return useQuery<PostTypeFiltersRecord | null>({
    queryKey: RQKEY(currentAccount?.did),
    enabled: !!currentAccount?.did,
    staleTime: STALE.INFINITY,
    queryFn: async () => {
      if (!currentAccount) throw new Error('Not signed in')
      try {
        const {data} = await agent.com.atproto.repo.getRecord({
          repo: currentAccount.did,
          collection: POST_TYPE_FILTER_NSID,
          rkey: 'self',
        })
        return data.value as PostTypeFiltersRecord
      } catch (e) {
        if (isRecordNotFoundError(e)) return null
        throw e
      }
    },
  })
}

import {buildRecord} from './serde'

export function useUpdatePostTypeFiltersMutation({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void
  onError?: (error: Error) => void
} = {}) {
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const agent = useAgent()

  type Ctx = {prev: PostTypeFiltersRecord | null}

  return useMutation<void, Error, UpdateOp, Ctx>({
    mutationFn: async op => {
      if (!currentAccount) throw new Error('Not signed in')
      const queryKey = RQKEY(currentAccount.did)
      const prev =
        queryClient.getQueryData<PostTypeFiltersRecord | null>(queryKey) ??
        null
      const built = buildRecord(prev, op)
      if (built.action === 'noop') return
      if (built.action === 'delete') {
        await agent.com.atproto.repo.deleteRecord({
          repo: currentAccount.did,
          collection: POST_TYPE_FILTER_NSID,
          rkey: 'self',
        })
        return
      }
      await agent.com.atproto.repo.putRecord({
        repo: currentAccount.did,
        collection: POST_TYPE_FILTER_NSID,
        rkey: 'self',
        record: built.record,
      })
    },
    onMutate: async op => {
      if (!currentAccount) return
      const queryKey = RQKEY(currentAccount.did)
      await queryClient.cancelQueries({queryKey})
      const prev =
        queryClient.getQueryData<PostTypeFiltersRecord | null>(queryKey) ??
        null
      const built = buildRecord(prev, op)
      if (built.action === 'noop') return {prev}
      queryClient.setQueryData<PostTypeFiltersRecord | null>(
        queryKey,
        built.record,
      )
      return {prev}
    },
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (error, _op, context) => {
      logger.error('Failed to update post-type filters', {safeMessage: error})
      if (currentAccount && context) {
        queryClient.setQueryData<PostTypeFiltersRecord | null>(
          RQKEY(currentAccount.did),
          context.prev,
        )
      }
      onError?.(error)
    },
    onSettled: () => {
      if (currentAccount) {
        void queryClient.invalidateQueries({
          queryKey: RQKEY(currentAccount.did),
        })
      }
    },
  })
}
