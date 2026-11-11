/*
 * Custom feeds use the same implementation as the legacy Home. It routes
 * permissioned-space and community-gated feeds, which the standard feed route
 * refuses.
 */
export {CustomFeedAPI} from '#/lib/api/feed/custom'
