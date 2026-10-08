import * as Notifications from 'expo-notifications'
import {type AtpAgent} from '@atproto/api'

import {PUBLIC_APPVIEW_DID} from '#/lib/constants'
import {unregisterPushToken} from '#/lib/notifications/notifications'

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getBadgeCountAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
}))
jest.mock('#/state/session', () => ({
  useAgent: jest.fn(),
  useSession: jest.fn(),
}))
jest.mock('#/analytics', () => ({useAnalytics: jest.fn()}))
jest.mock('#/../modules/expo-background-notification-handler', () => ({
  __esModule: true,
  default: {setBadgeCountAsync: jest.fn()},
}))

describe('unregisterPushToken', () => {
  it('uses the account service when an OAuth agent has no serviceUrl', async () => {
    const unregisterPush = jest.fn().mockResolvedValue(undefined)
    const agent = {
      app: {bsky: {notification: {unregisterPush}}},
      session: {handle: 'alice.test'},
    } as unknown as AtpAgent

    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus)
    jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue({
      type: 'ios',
      data: 'device-token',
    })

    await unregisterPushToken([agent], 'https://blacksky.app')

    expect(unregisterPush).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceDid: PUBLIC_APPVIEW_DID,
        token: 'device-token',
      }),
      expect.any(Object),
    )
  })
})
