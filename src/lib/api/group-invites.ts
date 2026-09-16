import {type AtpAgent} from '@atproto/api'

import {ACORN_SERVICE_URL} from '#/env'
import {getServiceAuthToken} from './service-auth'

export const GROUP_INVITE_LXM = 'community.blacksky.group.acceptInvite'

export const GroupInviteError = {
  InviteUnavailable: 'InviteUnavailable',
  GroupAtCapacity: 'GroupAtCapacity',
  AuthenticationRequired: 'AuthenticationRequired',
  AuthorizationUnavailable: 'AuthorizationUnavailable',
  InviteMisconfigured: 'InviteMisconfigured',
  RateLimitExceeded: 'RateLimitExceeded',
} as const

export type GroupInviteErrorCode =
  (typeof GroupInviteError)[keyof typeof GroupInviteError]

export class GroupInviteClientError extends Error {
  readonly code: GroupInviteErrorCode

  constructor(code: GroupInviteErrorCode) {
    super(code)
    this.name = 'GroupInviteClientError'
    this.code = code
  }
}

export type GroupInvitePreview = {
  community: {did: string; name: string}
  group: {name: string; displayName: string}
  expiresAt: string
}

export type GroupInviteFeed = {
  uri: string
  name: string
  canView: boolean
  canPost: boolean
}

export type GroupInviteAcceptance = {
  communityDid: string
  groupName: string
  membership: 'joined'
  feeds: GroupInviteFeed[]
}

type TrpcEnvelope = {
  result?: {data?: unknown}
  error?: {
    message?: string
    json?: {message?: string; data?: {code?: string}}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as {
    status?: unknown
    error?: unknown
    name?: unknown
  }
  return (
    value.status === 401 ||
    value.error === 'AuthenticationRequired' ||
    value.name === 'AuthenticationRequired'
  )
}

function parsePreview(value: unknown): GroupInvitePreview {
  if (!isRecord(value)) {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }
  const community = value.community
  const group = value.group
  if (
    !isRecord(community) ||
    !isNonEmptyString(community.did) ||
    !isNonEmptyString(community.name) ||
    !isRecord(group) ||
    !isNonEmptyString(group.name) ||
    !isNonEmptyString(group.displayName) ||
    !isNonEmptyString(value.expiresAt)
  ) {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }
  return {
    community: {did: community.did, name: community.name},
    group: {name: group.name, displayName: group.displayName},
    expiresAt: value.expiresAt,
  }
}

function parseAcceptance(value: unknown): GroupInviteAcceptance {
  if (!isRecord(value) || value.membership !== 'joined') {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }
  if (
    !isNonEmptyString(value.communityDid) ||
    !isNonEmptyString(value.groupName) ||
    !Array.isArray(value.feeds)
  ) {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }
  const feeds: GroupInviteFeed[] = []
  for (const feed of value.feeds) {
    if (
      !isRecord(feed) ||
      !isNonEmptyString(feed.uri) ||
      !isNonEmptyString(feed.name) ||
      typeof feed.canView !== 'boolean' ||
      typeof feed.canPost !== 'boolean' ||
      (!feed.canView && feed.canPost)
    ) {
      throw new GroupInviteClientError(
        GroupInviteError.AuthorizationUnavailable,
      )
    }
    feeds.push({
      uri: feed.uri,
      name: feed.name,
      canView: feed.canView,
      canPost: feed.canPost,
    })
  }
  return {
    communityDid: value.communityDid,
    groupName: value.groupName,
    membership: 'joined',
    feeds,
  }
}

function unwrapResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  const data = (value as {result?: {data?: unknown}}).result?.data
  if (data && typeof data === 'object' && 'json' in data) {
    return data.json
  }
  return data
}

function stableCodeFromResponse(body: TrpcEnvelope): GroupInviteErrorCode {
  const message = body.error?.json?.message || body.error?.message
  const stableMessage = mapStableCode(message)
  if (stableMessage) return stableMessage
  return (
    mapStableCode(body.error?.json?.data?.code) ??
    GroupInviteError.AuthorizationUnavailable
  )
}

function mapStableCode(
  raw: string | undefined,
): GroupInviteErrorCode | undefined {
  switch (raw) {
    case 'InviteUnavailable':
    case 'INVITE_UNAVAILABLE':
    case 'BAD_REQUEST':
    case 'NOT_FOUND':
      return GroupInviteError.InviteUnavailable
    case 'GroupAtCapacity':
    case 'GROUP_AT_CAPACITY':
    case 'CONFLICT':
      return GroupInviteError.GroupAtCapacity
    case 'AuthenticationRequired':
    case 'AUTHENTICATION_REQUIRED':
    case 'UNAUTHORIZED':
      return GroupInviteError.AuthenticationRequired
    case 'RateLimitExceeded':
    case 'RATE_LIMIT_EXCEEDED':
    case 'TOO_MANY_REQUESTS':
      return GroupInviteError.RateLimitExceeded
    case 'InviteMisconfigured':
    case 'INVITE_MISCONFIGURED':
      return GroupInviteError.InviteMisconfigured
    case 'AuthorizationUnavailable':
    case 'AUTHORIZATION_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
    case 'INTERNAL_SERVER_ERROR':
      return GroupInviteError.AuthorizationUnavailable
    default:
      return undefined
  }
}

async function request<T>({
  procedure,
  input,
  method,
  headers,
}: {
  procedure: string
  input: Record<string, string>
  method: 'GET' | 'POST'
  headers?: Record<string, string>
}): Promise<T> {
  const endpoint = `${ACORN_SERVICE_URL.replace(/\/$/, '')}/api/trpc/${procedure}`
  // Invite codes are bearer credentials. Keep them in a POST body so they do
  // not enter URL/access/referrer logs or browser history.
  const url = endpoint

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? {'Content-Type': 'application/json'} : {}),
        ...headers,
      },
      ...(method === 'POST' ? {body: JSON.stringify(input)} : undefined),
    })
  } catch {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }

  const body = (await response.json().catch(() => ({}))) as TrpcEnvelope
  if (!response.ok || body.error) {
    throw new GroupInviteClientError(stableCodeFromResponse(body))
  }

  const result = unwrapResult(body)
  if (result === undefined) {
    throw new GroupInviteClientError(GroupInviteError.AuthorizationUnavailable)
  }
  return result as T
}

export function previewGroupInvite(code: string) {
  return request<unknown>({
    procedure: 'groupInvites.preview',
    input: {code},
    method: 'POST',
  }).then(parsePreview)
}

export async function acceptGroupInvite({
  code,
  communityDid,
  agent,
}: {
  code: string
  communityDid: string
  agent: AtpAgent
}) {
  let token: string
  try {
    token = await getServiceAuthToken({
      agent,
      aud: communityDid,
      lxm: GROUP_INVITE_LXM,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  } catch (error) {
    throw new GroupInviteClientError(
      isAuthenticationError(error)
        ? GroupInviteError.AuthenticationRequired
        : GroupInviteError.AuthorizationUnavailable,
    )
  }

  const result = await request<unknown>({
    procedure: 'groupInvites.accept',
    input: {code},
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`},
  })
  return parseAcceptance(result)
}
