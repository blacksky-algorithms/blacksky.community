import {type Client} from '@atproto/lex'
import {type AtIdentifierString, AtUri} from '@atproto/syntax'
import {getServiceAuthToken} from '#/lib/api/service-auth'
import {isSpaceUri} from '#/lib/api/space-uri'
import {isRecordNotFoundError} from '#/lib/xrpc-error'
import {com} from '#/lexicons'

export const COMMUNITY_FEED_CONFIG_COLLECTION = 'community.blacksky.feed.config'
export const CHECK_FEED_PERMISSIONS = 'community.blacksky.feed.checkPermissions'
export const ADMIT_FEED_POST = 'community.blacksky.feed.admitPost'

export const COMMUNITY_FEED_PERMISSIONS = [
  'canView',
  'canPost',
  'canRemovePost',
  'canRemoveMember',
  'canConfigure',
  'canModerate',
] as const

export type CommunityFeedPermission =
  (typeof COMMUNITY_FEED_PERMISSIONS)[number]

export type CommunityFeedConfig = {
  $type: 'community.blacksky.feed.config'
  contentType: 'publicRecord' | 'communityRecord'
  visibility: 'public' | 'gated'
  authorization?: {
    serviceDid: string
    method?: string
  }
  policyMode?: 'memberList' | 'managingApp' | 'public'
  /**
   * Present when the feed's content lives in a permissioned space rather than
   * in an appview table. A plain string, never `format: at-uri` — a space URI
   * is not a valid at-uri.
   */
  space?: string
  group: string
  createdAt: string
}

/**
 * Whether this feed's content lives in a permissioned space.
 *
 * This is the discriminator, and the only one. `visibility: 'gated'` is an
 * invariant the config must satisfy to parse at all, not an input to the
 * decision; access itself is always decided by the space authority, never read
 * off the record.
 */
export function isSpaceBackedFeed(
  config: CommunityFeedConfig | null | undefined,
): config is CommunityFeedConfig & {space: string} {
  return !!config?.space && isSpaceUri(config.space)
}

export type CommunityFeedTarget = {
  feed: string
  name: string
  serviceDid: string
  config: CommunityFeedConfig
}

type CommunityFeedGenerator = {
  serviceDid: string
  name: string
}

function parseCommunityFeedConfig(value: unknown): CommunityFeedConfig | null {
  if (!value || typeof value !== 'object') return null
  const config = value as Record<string, unknown>
  const authorization = config.authorization as
    Record<string, unknown> | undefined
  if (
    config.$type !== COMMUNITY_FEED_CONFIG_COLLECTION ||
    (config.contentType !== 'publicRecord' &&
      config.contentType !== 'communityRecord') ||
    (config.visibility !== 'public' && config.visibility !== 'gated') ||
    (authorization !== undefined &&
      typeof authorization.serviceDid !== 'string') ||
    typeof config.group !== 'string' ||
    typeof config.createdAt !== 'string' ||
    (config.space !== undefined && typeof config.space !== 'string')
  ) {
    return null
  }
  return config as CommunityFeedConfig
}

export async function fetchCommunityFeedConfig(
  client: Client,
  feed: string,
): Promise<CommunityFeedConfig | null> {
  try {
    return await fetchCommunityFeedConfigStrict(client, feed)
  } catch {
    return null
  }
}

/**
 * Distinguishes "no config record exists" (null) from a failed read (throws).
 * The feed dispatch must not treat a transient config-read failure as "not
 * space-backed" and route a private feed down the standard path.
 */
export async function fetchCommunityFeedConfigStrict(
  client: Client,
  feed: string,
): Promise<CommunityFeedConfig | null> {
  let uri: AtUri
  try {
    uri = new AtUri(feed)
  } catch {
    return null
  }
  if (!uri.rkey) return null
  try {
    const data = await client.call(com.atproto.repo.getRecord, {
      repo: uri.host as AtIdentifierString,
      collection: COMMUNITY_FEED_CONFIG_COLLECTION,
      rkey: uri.rkey,
    })
    return parseCommunityFeedConfig(data.value)
  } catch (e) {
    if (isRecordNotFoundError(e)) {
      return null
    }
    throw e
  }
}

async function fetchFeedGenerator(
  client: Client,
  feed: string,
): Promise<CommunityFeedGenerator | null> {
  try {
    const uri = new AtUri(feed)
    if (!uri.rkey) return null
    const data = await client.call(com.atproto.repo.getRecord, {
      repo: uri.host as AtIdentifierString,
      collection: 'app.bsky.feed.generator',
      rkey: uri.rkey,
    })
    const value = data.value as Record<string, unknown>
    return typeof value.did === 'string'
      ? {
          serviceDid: value.did,
          name:
            typeof value.displayName === 'string' ? value.displayName : feed,
        }
      : null
  } catch {
    return null
  }
}

export async function fetchFeedServiceDid(
  client: Client,
  feed: string,
): Promise<string | null> {
  return (await fetchFeedGenerator(client, feed))?.serviceDid ?? null
}

function isCommunityFeedPermission(
  value: unknown,
): value is CommunityFeedPermission {
  return (
    typeof value === 'string' &&
    COMMUNITY_FEED_PERMISSIONS.includes(value as CommunityFeedPermission)
  )
}

async function fetchFeedPermissionsFromService(
  client: Client,
  feed: string,
  serviceDid: string,
): Promise<CommunityFeedPermission[]> {
  try {
    const token = await getServiceAuthToken({
      client,
      aud: serviceDid,
      lxm: CHECK_FEED_PERMISSIONS,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const response = await client.agent.fetchHandler(
      `/xrpc/${CHECK_FEED_PERMISSIONS}?${new URLSearchParams({feed})}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'atproto-proxy': `${serviceDid}#bsky_fg`,
        },
      },
    )
    if (!response.ok) return []
    const body = (await response.json()) as {permissions?: unknown}
    return Array.isArray(body.permissions)
      ? body.permissions.filter(isCommunityFeedPermission)
      : []
  } catch {
    return []
  }
}

export async function fetchFeedPermissions(
  client: Client,
  feed: string,
): Promise<CommunityFeedPermission[]> {
  const config = await fetchCommunityFeedConfig(client, feed)
  if (!config) return []
  const serviceDid = await fetchFeedServiceDid(client, feed)
  return serviceDid
    ? fetchFeedPermissionsFromService(client, feed, serviceDid)
    : []
}

export async function fetchCommunityFeedTarget(
  client: Client,
  feed: string,
): Promise<CommunityFeedTarget | null> {
  const [config, generator] = await Promise.all([
    fetchCommunityFeedConfig(client, feed),
    fetchFeedGenerator(client, feed),
  ])
  if (!config || !generator) return null
  const permissions = await fetchFeedPermissionsFromService(
    client,
    feed,
    generator.serviceDid,
  )
  return permissions.includes('canPost')
    ? {
        feed,
        name: generator.name,
        serviceDid: generator.serviceDid,
        config,
      }
    : null
}

export async function admitFeedPost(
  client: Client,
  target: CommunityFeedTarget,
  post: string,
  cid: string,
): Promise<void> {
  const token = await getServiceAuthToken({
    client,
    aud: target.serviceDid,
    lxm: ADMIT_FEED_POST,
    exp: Math.floor(Date.now() / 1000) + 60,
  })
  const response = await client.agent.fetchHandler(`/xrpc/${ADMIT_FEED_POST}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'atproto-proxy': `${target.serviceDid}#bsky_fg`,
    },
    body: JSON.stringify({feed: target.feed, post, cid}),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {message?: string}
    throw new Error(body.message || `HTTP ${response.status}`)
  }
}
