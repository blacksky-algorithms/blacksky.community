import {
  type AppBskyNotificationGetUnreadCount,
  type AppBskyNotificationListNotifications,
  type AtpAgent,
  jsonToLex,
  lexicons,
} from '@atproto/api'

import {communityXrpc} from '#/lib/api/community'
import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'

export const LIST_NOTIFICATIONS_METHOD =
  'community.blacksky.notification.listNotifications'
export const GET_UNREAD_COUNT_METHOD =
  'community.blacksky.notification.getUnreadCount'

const listNotificationsSchema = {
  lexicon: 1,
  id: LIST_NOTIFICATIONS_METHOD,
  defs: {
    main: {
      type: 'query',
      description:
        'Enumerate public and authorized permissioned-space notifications for the requesting account. An empty page may include a cursor and should be continued.',
      parameters: {
        type: 'params',
        properties: {
          reasons: {
            description: 'Notification reasons to include in response.',
            type: 'array',
            items: {
              type: 'string',
              description:
                'A reason that matches the reason property of #notification.',
            },
          },
          limit: {type: 'integer', minimum: 1, maximum: 100, default: 50},
          priority: {type: 'boolean'},
          cursor: {type: 'string'},
          seenAt: {type: 'string', format: 'datetime'},
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['notifications'],
          properties: {
            cursor: {type: 'string'},
            notifications: {
              type: 'array',
              items: {type: 'ref', ref: '#notification'},
            },
            priority: {type: 'boolean'},
            seenAt: {type: 'string', format: 'datetime'},
          },
        },
      },
    },
    notification: {
      type: 'object',
      required: [
        'uri',
        'cid',
        'author',
        'reason',
        'record',
        'isRead',
        'indexedAt',
      ],
      properties: {
        uri: {
          type: 'string',
          description:
            'The public AT URI or permissioned-space record URI that caused the notification.',
        },
        cid: {type: 'string', format: 'cid'},
        author: {type: 'ref', ref: 'app.bsky.actor.defs#profileView'},
        reason: {
          type: 'string',
          description: 'The reason why this notification was delivered.',
          knownValues: [
            'like',
            'repost',
            'follow',
            'mention',
            'reply',
            'quote',
            'starterpack-joined',
            'verified',
            'unverified',
            'like-via-repost',
            'repost-via-repost',
            'subscribed-post',
            'contact-match',
          ],
        },
        reasonSubject: {
          type: 'string',
          description:
            'The public AT URI or permissioned-space record URI that is the notification subject.',
        },
        record: {type: 'unknown'},
        starterPack: {
          description: 'The starter pack associated with this notification.',
          type: 'ref',
          ref: 'app.bsky.graph.defs#starterPackViewBasic',
        },
        isRead: {type: 'boolean'},
        indexedAt: {type: 'string', format: 'datetime'},
        labels: {
          type: 'array',
          items: {type: 'ref', ref: 'com.atproto.label.defs#label'},
        },
      },
    },
  },
} as const

const getUnreadCountSchema = {
  lexicon: 1,
  id: GET_UNREAD_COUNT_METHOD,
  defs: {
    main: {
      type: 'query',
      description:
        'Count unread public and authorized permissioned-space notifications for the requesting account.',
      parameters: {
        type: 'params',
        properties: {
          priority: {type: 'boolean'},
          seenAt: {type: 'string', format: 'datetime'},
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['count'],
          properties: {count: {type: 'integer'}},
        },
      },
    },
  },
} as const

type LexiconDoc = Parameters<typeof lexicons.add>[0]

function registerLexicon(doc: LexiconDoc) {
  if (!lexicons.get(doc.id)) {
    lexicons.add(doc)
  }
}

registerLexicon(listNotificationsSchema as unknown as LexiconDoc)
registerLexicon(getUnreadCountSchema as unknown as LexiconDoc)

export class CommunityNotificationXrpcError extends Error {
  constructor(
    method: string,
    public readonly status: number,
    public readonly error?: string,
  ) {
    super(`${method} failed (${status}${error ? ` ${error}` : ''})`)
  }
}

export async function listNotifications(
  agent: AtpAgent,
  params: AppBskyNotificationListNotifications.QueryParams,
): Promise<AppBskyNotificationListNotifications.OutputSchema> {
  const response = await communityXrpc(agent, LIST_NOTIFICATIONS_METHOD, {
    params,
  })
  if (!response.ok) {
    if (await isUnsupportedMethod(response)) {
      const result = await agent.app.bsky.notification.listNotifications(
        params,
        HOME_APPVIEW_PINNED_OPTS,
      )
      return result.data
    }
    throw await toXrpcError(LIST_NOTIFICATIONS_METHOD, response)
  }
  const data = jsonToLex(await response.json())
  lexicons.assertValidXrpcOutput(LIST_NOTIFICATIONS_METHOD, data)
  return data as AppBskyNotificationListNotifications.OutputSchema
}

export async function getUnreadCount(
  agent: AtpAgent,
  params: AppBskyNotificationGetUnreadCount.QueryParams = {},
): Promise<AppBskyNotificationGetUnreadCount.OutputSchema> {
  const response = await communityXrpc(agent, GET_UNREAD_COUNT_METHOD, {
    params,
  })
  if (!response.ok) {
    if (await isUnsupportedMethod(response)) {
      const result = await agent.app.bsky.notification.getUnreadCount(
        params,
        HOME_APPVIEW_PINNED_OPTS,
      )
      return result.data
    }
    throw await toXrpcError(GET_UNREAD_COUNT_METHOD, response)
  }
  const data = jsonToLex(await response.json())
  lexicons.assertValidXrpcOutput(GET_UNREAD_COUNT_METHOD, data)
  return data as AppBskyNotificationGetUnreadCount.OutputSchema
}

async function parseXrpcError(response: Response): Promise<{
  error?: string
}> {
  try {
    const body: unknown = await response.clone().json()
    return typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
      ? {error: body.error}
      : {}
  } catch {
    return {}
  }
}

async function isUnsupportedMethod(response: Response): Promise<boolean> {
  if (response.status !== 501) return false
  const body = await parseXrpcError(response)
  return body.error === 'MethodNotImplemented'
}

async function toXrpcError(method: string, response: Response) {
  const body = await parseXrpcError(response)
  return new CommunityNotificationXrpcError(method, response.status, body.error)
}
