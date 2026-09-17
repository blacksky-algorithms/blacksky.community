import {useMutation} from '@tanstack/react-query'

import {useAgent, useSession} from '#/state/session'
import {useRefreshSession} from '#/state/session/useRefreshSession'

export function useConfirmEmail({
  onSuccess,
  onError,
}: {onSuccess?: () => void; onError?: () => void} = {}) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const refreshSession = useRefreshSession()

  return useMutation({
    mutationFn: async ({token}: {token: string}) => {
      if (!currentAccount?.email) {
        throw new Error('No email found for the current account')
      }

      await agent.com.atproto.server.confirmEmail({
        email: currentAccount.email.trim(),
        token: token.trim(),
      })
      // will update session state at root of app
      await refreshSession()
    },
    onSuccess,
    onError,
  })
}
