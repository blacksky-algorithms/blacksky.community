import {BLUESKY_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {Features, features} from '#/analytics/features'

/**
 * Route search and feed-discovery reads to the Bluesky appview when the
 * `search_appview:route` flag is set to 'bluesky', to shed search load off the
 * home appview. Defaults to 'home', which returns empty opts so the call
 * follows the agent's current proxy header (home, or the global fallback
 * target during an outage). Read at call time so a flag flip takes effect on
 * the next query without a reload.
 */
export function searchAppviewOpts() {
  const route = features.getFeatureValue(Features.SearchAppviewRoute, 'home')
  return route === 'bluesky' ? BLUESKY_APPVIEW_PINNED_OPTS : {}
}
