import {type Client} from '@atproto/lex'
import {AtUri, type HandleString} from '@atproto/syntax'
import {type QueryClient, queryOptions, useQuery} from '@tanstack/react-query'

import {PUBLIC_APPVIEW} from '#/lib/constants'
import {STALE} from '#/state/queries'
import {useAppviewClient} from '#/state/session'
import {com} from '#/lexicons'
import {useUnstableProfileViewCache} from './profile'

const RQKEY_ROOT = 'resolved-did'
export const RQKEY = (didOrHandle: string) => [RQKEY_ROOT, didOrHandle]

const resolvedDidQueryOptions = (
  client: Client,
  getUnstableProfile: (did: string) => {did: string} | undefined,
  didOrHandle: string | undefined,
) =>
  queryOptions({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(didOrHandle ?? ''),
    queryFn: async () => {
      if (!didOrHandle) return ''
      // Just return the did if it's already one
      if (didOrHandle.startsWith('did:')) return didOrHandle

      /*
       * Resolution stays on the appview client: the old agent call was proxied
       * to the appview, and the PDS implementation is not equivalent for
       * handles hosted elsewhere.
       */
      try {
        const data = await client.call(com.atproto.identity.resolveHandle, {
          handle: didOrHandle as HandleString,
        })
        return data.did
      } catch (err) {
        const did = await resolveHandleViaAppView(didOrHandle)
        if (did) return did
        throw err
      }
    },
    initialData: () => {
      if (!didOrHandle) return undefined
      const profile = getUnstableProfile(didOrHandle)
      return profile?.did
    },
    enabled: !!didOrHandle,
    retry: false,
  })

export function useResolveUriQuery(uri: string | undefined) {
  const urip = uri ? new AtUri(uri) : undefined
  const host = urip?.host

  const client = useAppviewClient()
  const {getUnstableProfile} = useUnstableProfileViewCache()

  return useQuery({
    ...resolvedDidQueryOptions(client, getUnstableProfile, host),
    select: did => {
      if (!urip) return undefined
      return {
        did,
        uri: AtUri.make(did, urip.collection, urip.rkey).toString(),
      }
    },
  })
}

export function useResolveDidQuery(didOrHandle: string | undefined) {
  const client = useAppviewClient()
  const {getUnstableProfile} = useUnstableProfileViewCache()

  return useQuery(
    resolvedDidQueryOptions(client, getUnstableProfile, didOrHandle),
  )
}

async function resolveHandleViaAppView(
  handle: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as {did?: string}
    return data.did
  } catch {
    return undefined
  }
}

export function precacheResolvedUri(
  queryClient: QueryClient,
  handle: string,
  did: string,
) {
  queryClient.setQueryData<string>(RQKEY(handle), did)
}
