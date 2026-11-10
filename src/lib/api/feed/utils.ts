import {Platform} from 'react-native'
import {type Service} from '@atproto/lex'
import {AtUri} from '@atproto/syntax'

import {BSKY_FEED_OWNER_DIDS} from '#/lib/constants'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences'
import {ALT_PROXY_DID, IS_WEB} from '#/env'
import {device} from '#/storage'

const TRENDING_FEED_DID = 'did:plc:qrz3lhbyuxbeilrc6nekdqme'
const PROXY_TO_BLUESKY: Service = `${ALT_PROXY_DID}#bsky_appview`

let debugTopics = ''
if (IS_WEB && typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  debugTopics = params.get('debug_topics') ?? ''
}

export function createBskyTopicsHeader(userInterests?: string) {
  return {
    'x-atproto-bsky-topics': debugTopics || userInterests || '',
  }
}

/** Only disclose platform and service geolocation to Bluesky-owned feeds. */
export function createBskyFeedHeaders(feedUri: string) {
  return isBlueskyOwnedFeed(feedUri) ? createBskyAppviewHeaders() : {}
}

/**
 * Platform and IP-based service data for Bluesky appview requests, never GPS.
 * Read at request time so callers pick up service updates.
 */
export function createBskyAppviewHeaders() {
  const headers: Record<string, string> = {
    'x-atproto-bsky-platform': Platform.OS,
  }

  const geolocation = device.get(['geolocationServiceResponse'])
  if (geolocation?.countryCode) {
    headers['x-atproto-bsky-geo-country'] = geolocation.countryCode
  }
  if (geolocation?.regionCode) {
    headers['x-atproto-bsky-geo-region'] = geolocation.regionCode
  }
  if (geolocation?.city) {
    headers['x-atproto-bsky-geo-city'] = encodeURIComponent(geolocation.city)
  }
  if (geolocation?.ip) {
    headers['x-atproto-bsky-geo-ip'] = geolocation.ip
  }
  return headers
}

export function aggregateUserInterests(
  preferences?: UsePreferencesQueryResponse,
) {
  const tags = preferences?.interests.tags ?? []
  const updatedAt = preferences?.interests.updatedAt

  const interests = tags.join(',')
  return updatedAt ? `${interests};${updatedAt}` : interests
}

export function isBlueskyOwnedFeed(feedUri: string) {
  const uri = new AtUri(feedUri)
  return BSKY_FEED_OWNER_DIDS.includes(uri.host)
}

/** Call options that send a feed's requests to the appview that can serve it. */
export function getProxyOptsForFeed(feedUri: string): {service?: Service} {
  if (feedUri.includes(TRENDING_FEED_DID)) {
    return {service: PROXY_TO_BLUESKY}
  }
  return {}
}
