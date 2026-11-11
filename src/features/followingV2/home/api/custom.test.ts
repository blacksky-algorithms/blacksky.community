import {CustomFeedAPI as LegacyCustomFeedAPI} from '#/lib/api/feed/custom'
import {CustomFeedAPI} from './custom'

/*
 * `__tests__/lib/space-feed-routing.test.ts` covers the routing itself. This
 * pins the redesigned Home to that implementation, so a private feed pinned
 * there never reaches the standard feed route.
 */
it('uses the feed API that routes permissioned-space feeds', () => {
  expect(CustomFeedAPI).toBe(LegacyCustomFeedAPI)
})
