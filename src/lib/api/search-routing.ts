import {AtpAgent} from '@atproto/api'

import {BLUESKY_APPVIEW_PINNED_OPTS, PUBLIC_BSKY_API} from '#/lib/constants'
import {useAgent, useSession} from '#/state/session'
import {Features, features} from '#/analytics/features'

function routeSearchToBluesky() {
  return (
    features.getFeatureValue(Features.SearchAppviewRoute, 'bluesky') ===
    'bluesky'
  )
}

/**
 * Route search and feed-discovery reads to the Bluesky appview when the
 * `search_appview:route` flag is set to 'bluesky', to shed search load off the
 * home appview. Defaults to 'bluesky' because the home appview no longer serves
 * search. Read at call time so a flag flip takes effect on the next query
 * without a reload.
 */
export function searchAppviewOpts(): {headers?: Record<string, string>} {
  return routeSearchToBluesky() ? BLUESKY_APPVIEW_PINNED_OPTS : {}
}

const blueskyPublicAgent = new AtpAgent({service: PUBLIC_BSKY_API})

/**
 * The `atproto-proxy` header from {@link searchAppviewOpts} is only honored by a
 * PDS. A logged-out agent talks to the appview directly, so the header is
 * dropped and the read lands on the home appview regardless of the flag — use a
 * Bluesky-hosted agent for those calls instead.
 */
export function useSearchAgent(): AtpAgent {
  const agent = useAgent()
  const {hasSession} = useSession()
  return !hasSession && routeSearchToBluesky() ? blueskyPublicAgent : agent
}
