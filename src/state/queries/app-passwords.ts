import {type ComAtprotoServerCreateAppPassword} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  gateCreateAppPassword,
  gateListAppPasswords,
  gateRevokeAppPassword,
} from '#/lib/api/gatekeeper'
import {STALE} from '#/state/queries'
import {useAgent} from '../session'

const RQKEY_ROOT = 'app-passwords'
export const RQKEY = () => [RQKEY_ROOT]

export type GatekeeperConfig = {
  serviceUrl: string
  did: string
  password: string
}

export function useAppPasswordsQuery(gatekeeper?: GatekeeperConfig) {
  const agent = useAgent()
  return useQuery({
    staleTime: STALE.MINUTES.FIVE,
    queryKey: [...RQKEY(), gatekeeper ? 'gate' : 'direct'],
    queryFn: async () => {
      if (gatekeeper) {
        const res = await gateListAppPasswords({
          serviceUrl: gatekeeper.serviceUrl,
          did: gatekeeper.did,
          password: gatekeeper.password,
        })
        return res.passwords
      }
      const res = await agent.com.atproto.server.listAppPasswords({})
      return res.data.passwords
    },
    enabled: gatekeeper ? !!gatekeeper.password : true,
  })
}

export function useAppPasswordCreateMutation(gatekeeper?: GatekeeperConfig) {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useMutation<
    ComAtprotoServerCreateAppPassword.OutputSchema,
    Error,
    {name: string; privileged: boolean}
  >({
    mutationFn: async ({name, privileged}) => {
      if (gatekeeper) {
        return await gateCreateAppPassword({
          serviceUrl: gatekeeper.serviceUrl,
          did: gatekeeper.did,
          password: gatekeeper.password,
          name,
          privileged,
        })
      }
      return (
        await agent.com.atproto.server.createAppPassword({
          name,
          privileged,
        })
      ).data
    },
    onSuccess() {
      void queryClient.invalidateQueries({
        queryKey: RQKEY(),
      })
    },
  })
}

export function useAppPasswordDeleteMutation(gatekeeper?: GatekeeperConfig) {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useMutation<void, Error, {name: string}>({
    mutationFn: async ({name}) => {
      if (gatekeeper) {
        await gateRevokeAppPassword({
          serviceUrl: gatekeeper.serviceUrl,
          did: gatekeeper.did,
          password: gatekeeper.password,
          name,
        })
        return
      }
      await agent.com.atproto.server.revokeAppPassword({
        name,
      })
    },
    onSuccess() {
      void queryClient.invalidateQueries({
        queryKey: RQKEY(),
      })
    },
  })
}
