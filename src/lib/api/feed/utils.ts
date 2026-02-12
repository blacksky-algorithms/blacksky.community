import {AtUri} from '@atproto/api'

import {BSKY_FEED_OWNER_DIDS} from '#/lib/constants'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences'
import {ALT_PROXY_DID, IS_WEB} from '#/env'

const TRENDING_FEED_DID = 'did:plc:qrz3lhbyuxbeilrc6nekdqme'
const PROXY_TO_BLUESKY = `${ALT_PROXY_DID}#bsky_appview`

let debugTopics = ''
if (IS_WEB && typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  debugTopics = params.get('debug_topics') ?? ''
}

export function createBskyTopicsHeader(userInterests?: string) {
  return {
    'X-Bsky-Topics': debugTopics || userInterests || '',
  }
}

export function aggregateUserInterests(
  preferences?: UsePreferencesQueryResponse,
) {
  return preferences?.interests?.tags?.join(',') || ''
}

export function isBlueskyOwnedFeed(feedUri: string) {
  const uri = new AtUri(feedUri)
  return BSKY_FEED_OWNER_DIDS.includes(uri.host)
}

export function getProxyHeadersForFeed(feedUri: string) {
  if (feedUri.includes(TRENDING_FEED_DID)) {
    return {'atproto-proxy': PROXY_TO_BLUESKY}
  }
  return {}
}
