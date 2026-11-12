import {type AtIdentifierString} from '@atproto/syntax'
import {useQuery} from '@tanstack/react-query'

import {logger} from '#/logger'
import {STALE} from '#/state/queries'
import {useAppviewClient} from '#/state/session'
import {app} from '#/lexicons'

export const createOnboardingCommunityStarterPacksQueryKey = (did?: string) => [
  'onboarding-community-starter-packs',
  did,
]

/**
 * Fetches all starter packs authored by a community DID and hydrates each one
 * to a full StarterPackView (via getStarterPack), so the onboarding
 * StarterPackCard has the `list` and `listItemsSample` fields it needs.
 *
 * Returns the same shape as useOnboardingSuggestedStarterPacksQuery so the two
 * are interchangeable from the consumer's perspective.
 */
export function useOnboardingCommunityStarterPacksQuery({
  did,
  enabled,
}: {
  did?: string
  enabled?: boolean
}) {
  const client = useAppviewClient()

  return useQuery({
    enabled: !!did && enabled !== false,
    staleTime: STALE.MINUTES.THREE,
    queryKey: createOnboardingCommunityStarterPacksQueryKey(did),
    queryFn: async () => {
      const data = await client.call(app.bsky.graph.getActorStarterPacks, {
        actor: did! as AtIdentifierString,
        limit: 10,
      })

      const hydrated = await Promise.all(
        data.starterPacks.map(async basic => {
          try {
            const res = await client.call(app.bsky.graph.getStarterPack, {
              starterPack: basic.uri,
            })
            return res.starterPack
          } catch (e) {
            logger.error('Failed to hydrate community starter pack', {
              safeMessage: e,
              uri: basic.uri,
            })
            return null
          }
        }),
      )

      return {
        starterPacks: hydrated.filter(
          (p): p is app.bsky.graph.defs.StarterPackView => p !== null,
        ),
        recId: undefined as string | undefined,
      }
    },
  })
}
