import {useMemo} from 'react'

import type * as bsky from '#/types/bsky'
import {type FlairSpec, resolveDecoration} from './registry'

// Phase 1: hardcoded DID → decoration mapping
const HARDCODED_FLAIR: Record<string, string> = {
  'did:plc:w4xbfzo7kqfes5zb7r6qv3rw': 'community.blacksky.actor.flair#inferno',
}

export function useActorFlair(
  actor?: bsky.profile.AnyProfileView,
): FlairSpec | null {
  return useMemo(() => {
    if (!actor) return null

    // Phase 1: check hardcoded mapping
    const hardcoded = HARDCODED_FLAIR[actor.did]
    if (hardcoded) {
      return resolveDecoration(hardcoded)
    }

    // Phase 2: read from AppView profile data
    const decoration = (actor as any).flair?.decoration as string | undefined
    if (decoration) {
      return resolveDecoration(decoration)
    }

    return null
  }, [actor])
}
