import {type Client} from '@atproto/lex'
import * as Notifications from 'expo-notifications'

import {PUBLIC_APPVIEW_DID} from '#/lib/constants'
import {app} from '#/lexicons'
import {unregisterPushToken} from '#/lib/notifications/notifications'

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getBadgeCountAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
}))
jest.mock('#/state/session', () => ({
  useAppviewClient: jest.fn(),
  useSession: jest.fn(),
}))
jest.mock('#/analytics', () => ({useAnalytics: jest.fn()}))
jest.mock('#/../modules/expo-background-notification-handler', () => ({
  __esModule: true,
  default: {setBadgeCountAsync: jest.fn()},
}))

describe('unregisterPushToken', () => {
  it('unregisters from the appview that matches the account service', async () => {
    const call = jest.fn().mockResolvedValue(undefined)
    const client = {call} as unknown as Client

    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus)
    jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue({
      type: 'ios',
      data: 'device-token',
    })

    await unregisterPushToken([
      {client, service: 'https://blacksky.app', handle: 'alice.test'},
    ])

    expect(call).toHaveBeenCalledWith(
      app.bsky.notification.unregisterPush,
      expect.objectContaining({
        serviceDid: PUBLIC_APPVIEW_DID,
        token: 'device-token',
      }),
      expect.any(Object),
    )
  })
})
