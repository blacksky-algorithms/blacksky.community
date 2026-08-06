import {type AtpAgent, AtUri} from '@atproto/api'

import {getServiceAuthToken} from '#/lib/api/service-auth'

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
  contentStore?: string
  group: string
  createdAt: string
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
    | Record<string, unknown>
    | undefined
  if (
    config.$type !== COMMUNITY_FEED_CONFIG_COLLECTION ||
    (config.contentType !== 'publicRecord' &&
      config.contentType !== 'communityRecord') ||
    (config.visibility !== 'public' && config.visibility !== 'gated') ||
    (authorization !== undefined &&
      typeof authorization.serviceDid !== 'string') ||
    typeof config.group !== 'string' ||
    typeof config.createdAt !== 'string'
  ) {
    return null
  }
  return config as CommunityFeedConfig
}

export async function fetchCommunityFeedConfig(
  agent: AtpAgent,
  feed: string,
): Promise<CommunityFeedConfig | null> {
  try {
    const uri = new AtUri(feed)
    if (!uri.rkey) return null
    const {data} = await agent.com.atproto.repo.getRecord({
      repo: uri.hostname,
      collection: COMMUNITY_FEED_CONFIG_COLLECTION,
      rkey: uri.rkey,
    })
    return parseCommunityFeedConfig(data.value)
  } catch {
    return null
  }
}

async function fetchFeedGenerator(
  agent: AtpAgent,
  feed: string,
): Promise<CommunityFeedGenerator | null> {
  try {
    const uri = new AtUri(feed)
    if (!uri.rkey) return null
    const {data} = await agent.com.atproto.repo.getRecord({
      repo: uri.hostname,
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
  agent: AtpAgent,
  feed: string,
): Promise<string | null> {
  return (await fetchFeedGenerator(agent, feed))?.serviceDid ?? null
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
  agent: AtpAgent,
  feed: string,
  serviceDid: string,
): Promise<CommunityFeedPermission[]> {
  try {
    const token = await getServiceAuthToken({
      agent,
      aud: serviceDid,
      lxm: CHECK_FEED_PERMISSIONS,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const response = await agent.fetchHandler(
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
  agent: AtpAgent,
  feed: string,
): Promise<CommunityFeedPermission[]> {
  const config = await fetchCommunityFeedConfig(agent, feed)
  if (!config) return []
  const serviceDid = await fetchFeedServiceDid(agent, feed)
  return serviceDid
    ? fetchFeedPermissionsFromService(agent, feed, serviceDid)
    : []
}

export async function fetchCommunityFeedTarget(
  agent: AtpAgent,
  feed: string,
): Promise<CommunityFeedTarget | null> {
  const [config, generator] = await Promise.all([
    fetchCommunityFeedConfig(agent, feed),
    fetchFeedGenerator(agent, feed),
  ])
  if (!config || !generator) return null
  const permissions = await fetchFeedPermissionsFromService(
    agent,
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
  agent: AtpAgent,
  target: CommunityFeedTarget,
  post: string,
  cid: string,
): Promise<void> {
  const token = await getServiceAuthToken({
    agent,
    aud: target.serviceDid,
    lxm: ADMIT_FEED_POST,
    exp: Math.floor(Date.now() / 1000) + 60,
  })
  const response = await agent.fetchHandler(`/xrpc/${ADMIT_FEED_POST}`, {
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
