import {useMutation} from '@tanstack/react-query'

import {useAgent} from '#/state/session'
import {useRefreshSession} from '#/state/session/useRefreshSession'
import {useRequestEmailUpdate} from '#/components/dialogs/EmailDialog/data/useRequestEmailUpdate'

async function updateEmailAndRefreshSession(
  agent: ReturnType<typeof useAgent>,
  refreshSession: () => Promise<void>,
  email: string,
  token?: string,
) {
  await agent.com.atproto.server.updateEmail({email: email.trim(), token})
  await refreshSession()
}

export function useUpdateEmail() {
  const agent = useAgent()
  const refreshSession = useRefreshSession()
  const {mutateAsync: requestEmailUpdate} = useRequestEmailUpdate()

  return useMutation<
    {status: 'tokenRequired' | 'success'},
    Error,
    {email: string; token?: string}
  >({
    mutationFn: async ({email, token}: {email: string; token?: string}) => {
      if (token) {
        await updateEmailAndRefreshSession(agent, refreshSession, email, token)
        return {
          status: 'success',
        }
      } else {
        const {tokenRequired} = await requestEmailUpdate()
        if (tokenRequired) {
          return {
            status: 'tokenRequired',
          }
        } else {
          await updateEmailAndRefreshSession(
            agent,
            refreshSession,
            email,
            token,
          )
          return {
            status: 'success',
          }
        }
      }
    },
  })
}
