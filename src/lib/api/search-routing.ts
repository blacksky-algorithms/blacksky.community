import {BLUESKY_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {Features, features} from '#/analytics/features'

/**
 * Route search and feed-discovery reads to the Bluesky appview when the
 * `search_appview:route` flag is set to 'bluesky', to shed search load off the
 * home appview. Defaults to 'bluesky' because the home appview no longer serves
 * search. Read at call time so a flag flip takes effect on the next query
 * without a reload.
 */
export function searchAppviewOpts() {
  const route = features.getFeatureValue(Features.SearchAppviewRoute, 'bluesky')
  return route === 'bluesky' ? BLUESKY_APPVIEW_PINNED_OPTS : {}
}
