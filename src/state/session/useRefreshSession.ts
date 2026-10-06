import {useCallback} from 'react'

import {useAgent, useSession, useSessionApi} from '#/state/session'

/**
 * Re-reads the current account from the PDS after a change to it (email,
 * 2FA, handle). Password sessions refresh in place; OAuth agents cannot, so
 * the account is resumed through the session API instead.
 */
export function useRefreshSession() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const {resumeSession} = useSessionApi()

  return useCallback(async () => {
    if ('resumeSession' in agent && agent.session) {
      await agent.resumeSession(agent.session)
    } else if (currentAccount) {
      await resumeSession(currentAccount)
    }
  }, [agent, currentAccount, resumeSession])
}
