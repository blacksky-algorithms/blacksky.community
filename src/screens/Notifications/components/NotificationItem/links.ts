import {AtUri} from '@atproto/syntax'

import {makeProfileLink} from '#/lib/routes/links'
import {postUriToRelativePath} from '#/lib/strings/url-helpers'

/**
 * `getPosts`, which backs the activity list screen, takes at most 25 URIs.
 */
const MAX_ACTIVITY_LIST_POSTS = 25

/**
 * Link to a post, optionally to a sub-route like `liked-by`. Takes a post
 * view or the record view of a quoted post.
 */
export function makePostLink(
  post: {uri: string; author: {did: string; handle: string}},
  ...segments: string[]
) {
  /*
   * A post in a permissioned space or a community collection needs the query
   * that names it, and a space record URI does not parse as an at-uri at all.
   */
  const path = postUriToRelativePath(post.uri)
  if (path === undefined) {
    return makeProfileLink(
      post.author,
      'post',
      new AtUri(post.uri).rkey,
      ...segments,
    )
  }
  const [pathname, query] = path.split('?')
  return [pathname, ...segments].join('/') + (query ? `?${query}` : '')
}

/**
 * Link to the activity list screen, which shows the given posts as a feed.
 * Only the first `MAX_ACTIVITY_LIST_POSTS` are included.
 */
export function makeActivityListLink(uris: string[]) {
  const posts = uris.slice(0, MAX_ACTIVITY_LIST_POSTS).join(',')
  return `/notifications/activity?posts=${encodeURIComponent(posts)}`
}
