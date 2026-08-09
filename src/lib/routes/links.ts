import {type AppBskyGraphDefs, AtUri} from '@atproto/api'

import {parseSpaceRecordUri, spaceUriOf} from '#/lib/api/space-uri'

export function makeProfileLink(
  info: {
    did: string
    handle: string
  },
  ...segments: string[]
) {
  return [`/profile`, info.did, ...segments].join('/')
}

/**
 * The in-app path for a post, whatever kind it is.
 *
 * Three shapes share one route: a public post, the community stub (which
 * carries its collection as a query param), and a permissioned-space record,
 * whose URI has seven segments and cannot be rebuilt from the path alone —
 * so the space it belongs to rides along as `?space=`. The author DID and
 * rkey come from the path exactly as they always have.
 */
export function postPermalink(
  author: {did: string; handle: string},
  postUri: string,
  ...segments: string[]
): string {
  const spaceRef = parseSpaceRecordUri(postUri)
  if (spaceRef) {
    const base = makeProfileLink(author, 'post', spaceRef.rkey, ...segments)
    return `${base}?space=${encodeURIComponent(spaceUriOf(spaceRef))}`
  }
  const urip = new AtUri(postUri)
  const base = makeProfileLink(author, 'post', urip.rkey, ...segments)
  return urip.collection && urip.collection !== 'app.bsky.feed.post'
    ? `${base}?collection=${urip.collection}`
    : base
}

export function makeCustomFeedLink(
  did: string,
  rkey: string,
  segment?: string,
  feedCacheKey?: 'discover' | 'explore',
) {
  return (
    [`/profile`, did, 'feed', rkey, ...(segment ? [segment] : [])].join('/') +
    (feedCacheKey ? `?feedCacheKey=${encodeURIComponent(feedCacheKey)}` : '')
  )
}

export function makeListLink(did: string, rkey: string, ...segments: string[]) {
  return [`/profile`, did, 'lists', rkey, ...segments].join('/')
}

export function makeTagLink(did: string) {
  return `/search?q=${encodeURIComponent(did)}`
}

export function makeSearchLink(props: {query: string; from?: 'me' | string}) {
  return `/search?q=${encodeURIComponent(
    props.query + (props.from ? ` from:${props.from}` : ''),
  )}`
}

export function makeStarterPackLink(
  starterPackOrName:
    | AppBskyGraphDefs.StarterPackViewBasic
    | AppBskyGraphDefs.StarterPackView
    | string,
  rkey?: string,
) {
  if (typeof starterPackOrName === 'string') {
    return `https://blacksky.community/start/${starterPackOrName}/${rkey}`
  } else {
    const uriRkey = new AtUri(starterPackOrName.uri).rkey
    return `https://blacksky.community/start/${starterPackOrName.creator.handle}/${uriRkey}`
  }
}
