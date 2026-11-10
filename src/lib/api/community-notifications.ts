import {type Client, XrpcResponseError} from '@atproto/lex'

import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {app, community} from '#/lexicons'

export const LIST_NOTIFICATIONS_METHOD =
  community.blacksky.notification.listNotifications.$lxm
export const GET_UNREAD_COUNT_METHOD =
  community.blacksky.notification.getUnreadCount.$lxm

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
