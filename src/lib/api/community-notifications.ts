import {type Client, XrpcResponseError} from '@atproto/lex'

import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {app, community} from '#/lexicons'
import {toPostView} from './space-views'

export const LIST_NOTIFICATIONS_METHOD =
  community.blacksky.notification.listNotifications.$lxm
export const GET_UNREAD_COUNT_METHOD =
  community.blacksky.notification.getUnreadCount.$lxm
export const GET_GROUPED_NOTIFICATIONS_METHOD =
  community.blacksky.notification.getGroupedNotifications.$lxm

const STANDARD_GROUP_PREFIX = `${app.bsky.notification.getGroupedNotifications.$lxm}#`
const COMMUNITY_GROUP_PREFIX = `${GET_GROUPED_NOTIFICATIONS_METHOD}#`
const SPACE_POST_VIEW = 'community.blacksky.feed.defs#spacePostView'

/*
 * An appview that predates these methods answers 501 MethodNotImplemented. The
 * standard methods then return the public notifications, which is everything
 * such an appview knows about.
 *
 * The name is read from the response body: the client also derives it from a
 * bare 501, which any intermediary can answer.
 */
function isUnsupportedMethod(e: unknown): boolean {
  if (!(e instanceof XrpcResponseError) || e.status !== 501) return false
  const body = e.body
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    body.error === 'MethodNotImplemented'
  )
}

export async function listNotifications(
  client: Client,
  params: app.bsky.notification.listNotifications.$Params,
): Promise<app.bsky.notification.listNotifications.$OutputBody> {
  try {
    const data = await client.call(
      community.blacksky.notification.listNotifications,
      params,
      HOME_APPVIEW_PINNED_OPTS,
    )
    /*
     * The community view is the standard one except that `uri` and
     * `reasonSubject` may name a record in a permissioned space, which is not
     * an at-uri.
     */
    return data as unknown as app.bsky.notification.listNotifications.$OutputBody
  } catch (e) {
    if (!isUnsupportedMethod(e)) throw e
    return client.call(
      app.bsky.notification.listNotifications,
      params,
      HOME_APPVIEW_PINNED_OPTS,
    )
  }
}

export async function getUnreadCount(
  client: Client,
  params: app.bsky.notification.getUnreadCount.$Params = {},
): Promise<app.bsky.notification.getUnreadCount.$OutputBody> {
  try {
    return await client.call(
      community.blacksky.notification.getUnreadCount,
      params,
      HOME_APPVIEW_PINNED_OPTS,
    )
  } catch (e) {
    if (!isUnsupportedMethod(e)) throw e
    return client.call(
      app.bsky.notification.getUnreadCount,
      params,
      HOME_APPVIEW_PINNED_OPTS,
    )
  }
}

function toStandardGroupType(type: string): string {
  return type.replace(COMMUNITY_GROUP_PREFIX, STANDARD_GROUP_PREFIX)
}

/*
 * The community groups are the standard ones under this lexicon's id, and a
 * post in a permissioned space arrives as a space post view. Both are renamed
 * so the standard hydration reads them.
 */
function toStandardGroupedNotifications(
  data: community.blacksky.notification.getGroupedNotifications.$OutputBody,
): app.bsky.notification.getGroupedNotifications.$OutputBody {
  return {
    ...data,
    groups: data.groups.map(group => ({
      ...group,
      ...(group.$type ? {$type: toStandardGroupType(group.$type)} : {}),
      kind: {...group.kind, $type: toStandardGroupType(group.kind.$type)},
    })),
    relatedViews: data.relatedViews?.map(view =>
      view.$type === SPACE_POST_VIEW ? (toPostView(view) ?? view) : view,
    ),
  } as unknown as app.bsky.notification.getGroupedNotifications.$OutputBody
}

export async function getGroupedNotifications(
  client: Client,
  params: app.bsky.notification.getGroupedNotifications.$Params,
): Promise<app.bsky.notification.getGroupedNotifications.$OutputBody> {
  try {
    return toStandardGroupedNotifications(
      await client.call(
        community.blacksky.notification.getGroupedNotifications,
        params,
        HOME_APPVIEW_PINNED_OPTS,
      ),
    )
  } catch (e) {
    if (!isUnsupportedMethod(e)) throw e
    return client.call(
      app.bsky.notification.getGroupedNotifications,
      params,
      HOME_APPVIEW_PINNED_OPTS,
    )
  }
}
