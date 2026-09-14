import {useCallback} from 'react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {acceptGroupInvite, previewGroupInvite} from '#/lib/api/group-invites'
import {useAgent} from '#/state/session'
import {createQueryKey} from './util'

export const groupInvitePreviewQueryKey = (code: string) =>
  createQueryKey('group-invite-preview', {code}, {persistedVersion: 1})

export function useGroupInvitePreviewQuery(code?: string) {
  return useQuery({
    queryKey: groupInvitePreviewQueryKey(code ?? ''),
    queryFn: () => {
      if (!code) throw new Error('Missing invite code')
      return previewGroupInvite(code)
    },
    enabled: Boolean(code),
    retry: false,
  })
}

export function usePrefetchGroupInvitePreview() {
  const queryClient = useQueryClient()
  return useCallback(
    (code: string) =>
      queryClient.prefetchQuery({
        queryKey: groupInvitePreviewQueryKey(code),
        queryFn: () => previewGroupInvite(code),
        staleTime: 15_000,
      }),
    [queryClient],
  )
}

export function useAcceptGroupInviteMutation() {
  const agent = useAgent()
  return useMutation({
    mutationFn: ({code, communityDid}: {code: string; communityDid: string}) =>
      acceptGroupInvite({code, communityDid, agent}),
  })
}
