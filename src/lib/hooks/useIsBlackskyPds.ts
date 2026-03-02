import {useQuery} from '@tanstack/react-query'

import {useSession} from '#/state/session'

const RQKEY_ROOT = 'gatekeeper-check'
const RQKEY = (serviceUrl: string) => [RQKEY_ROOT, serviceUrl]

/**
 * Returns true if the current user's PDS runs the pds-gatekeeper sidecar.
 *
 * Detection works by checking `/xrpc/_health` on the PDS -- the gatekeeper
 * intercepts this endpoint and adds a `gatekeeper_version` field to the
 * response. Any PDS running the gatekeeper is automatically detected.
 */
export function useIsBlackskyPds(): boolean {
  const {currentAccount} = useSession()
  const serviceUrl = currentAccount?.service ?? ''

  const {data} = useQuery({
    queryKey: RQKEY(serviceUrl),
    queryFn: async () => {
      const base = serviceUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/xrpc/_health`)
      if (!res.ok) return false
      const json = (await res.json()) as {gatekeeper_version?: string}
      return typeof json.gatekeeper_version === 'string'
    },
    staleTime: Infinity,
    enabled: !!serviceUrl,
  })

  return data === true
}
