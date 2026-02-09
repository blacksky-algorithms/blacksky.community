import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'

const RQKEY_ROOT = 'oc-link-status'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

type OCLinkStatus = {
  linked: boolean
  email?: string
}

type OCInitLinkResponse = {
  status: 'linked' | 'verification_needed'
}

type OCVerifyEmailResponse = {
  status: 'linked'
}

export function useOCLinkStatusQuery(did: string | undefined) {
  const agent = useAgent()

  return useQuery<OCLinkStatus>({
    staleTime: STALE.MINUTES.FIVE,
    queryKey: RQKEY(did ?? ''),
    async queryFn() {
      const res = await fetch(`${agent.serviceUrl}/api/oc/link-status`, {
        headers: {
          Authorization: `Bearer ${agent.session?.accessJwt}`,
        },
      })
      if (!res.ok) {
        throw new Error('Failed to fetch OC link status')
      }
      return res.json()
    },
    enabled: !!did,
  })
}

export function useOCInitLinkMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()

  return useMutation<OCInitLinkResponse, Error, {email: string}>({
    async mutationFn({email}) {
      const res = await fetch(`${agent.serviceUrl}/api/oc/init-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agent.session?.accessJwt}`,
        },
        body: JSON.stringify({email}),
      })
      if (!res.ok) {
        throw new Error('Failed to initiate OC link')
      }
      return res.json()
    },
    onSuccess(_data) {
      if (currentAccount?.did) {
        queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
      }
    },
  })
}

export function useOCVerifyEmailMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()

  return useMutation<
    OCVerifyEmailResponse,
    Error,
    {email: string; code: string}
  >({
    async mutationFn({email, code}) {
      const res = await fetch(`${agent.serviceUrl}/api/oc/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agent.session?.accessJwt}`,
        },
        body: JSON.stringify({email, code}),
      })
      if (!res.ok) {
        throw new Error('Failed to verify email')
      }
      return res.json()
    },
    onSuccess(_data) {
      if (currentAccount?.did) {
        queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
      }
    },
  })
}
