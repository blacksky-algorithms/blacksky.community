import {
  type AppBskyNotificationGetUnreadCount,
  type AppBskyNotificationListNotifications,
  type AtpAgent,
  lexicons,
} from '@atproto/api'

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  jsonToLex: (value: unknown) => value,
}))
jest.mock('multiformats/cid', () => ({
  CID: {
    asCID: () => null,
    parse: (value: string) => {
      if (!value.startsWith('bafy')) throw new Error('invalid cid')
      return {toString: () => value}
    },
  },
}))

import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {
  type CommunityNotificationXrpcError,
  GET_UNREAD_COUNT_METHOD,
  getUnreadCount,
  LIST_NOTIFICATIONS_METHOD,
  listNotifications,
} from '../community-notifications'

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const PRIVATE_URI = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kprivate`
const PUBLIC_URI = 'at://did:plc:alice/app.bsky.feed.post/3kpublic'
const CID = 'bafyreihhl5mpvjkrhnnagen2fomozzhnhhdq2jr6cego2nzbvmwewv5rd4'

function notification(uri: string) {
  return {
    uri,
    cid: CID,
    author: {did: 'did:plc:alice', handle: 'alice.test'},
    reason: 'mention',
    reasonSubject: uri,
    record: {
      $type: 'app.bsky.feed.post',
      text: 'hello',
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    isRead: false,
    indexedAt: '2026-09-01T00:00:00.000Z',
  }
}

function listBody(uri = PRIVATE_URI) {
  return {
    cursor: 'next',
    notifications: [notification(uri)],
    priority: false,
    seenAt: '2026-09-01T00:00:00.000Z',
  }
}

function mockAgent() {
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
  const standardList = jest.fn<
    Promise<{data: AppBskyNotificationListNotifications.OutputSchema}>,
    [AppBskyNotificationListNotifications.QueryParams, unknown]
  >()
  const standardCount = jest.fn<
    Promise<{data: AppBskyNotificationGetUnreadCount.OutputSchema}>,
    [AppBskyNotificationGetUnreadCount.QueryParams, unknown]
  >()
  const agent = {
    fetchHandler,
    app: {
      bsky: {
        notification: {
          listNotifications: standardList,
          getUnreadCount: standardCount,
        },
      },
    },
  } as unknown as AtpAgent
  return {agent, fetchHandler, standardList, standardCount}
}

describe('community notification API', () => {
  it('accepts private notification output rejected by the standard catalog', async () => {
    const {agent, fetchHandler} = mockAgent()
    const body = listBody()
    fetchHandler.mockResolvedValue(new Response(JSON.stringify(body)))

    expect(() =>
      lexicons.assertValidXrpcOutput(
        'app.bsky.notification.listNotifications',
        body,
      ),
    ).toThrow()
    await expect(
      listNotifications(agent, {limit: 30, reasons: ['mention']}),
    ).resolves.toEqual(body)
    expect(fetchHandler).toHaveBeenCalledWith(
      expect.stringContaining(`/xrpc/${LIST_NOTIFICATIONS_METHOD}?`),
      expect.objectContaining({method: 'GET'}),
    )
  })

  it('keeps public notification output compatible', async () => {
    const {agent, fetchHandler} = mockAgent()
    const body = listBody(PUBLIC_URI)
    fetchHandler.mockResolvedValue(new Response(JSON.stringify(body)))

    expect(() =>
      lexicons.assertValidXrpcOutput(
        'app.bsky.notification.listNotifications',
        body,
      ),
    ).not.toThrow()
    await expect(listNotifications(agent, {})).resolves.toEqual(body)
  })

  it('rejects malformed successful output before returning it', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify({notifications: [{uri: PRIVATE_URI}]})),
    )

    await expect(listNotifications(agent, {})).rejects.toThrow()
  })

  it('falls back only for a 501 MethodNotImplemented response', async () => {
    const {agent, fetchHandler, standardList, standardCount} = mockAgent()
    fetchHandler
      .mockResolvedValueOnce(
        new Response(JSON.stringify({error: 'MethodNotImplemented'}), {
          status: 501,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({error: 'MethodNotImplemented'}), {
          status: 501,
        }),
      )
    standardList.mockResolvedValue({
      data: listBody(PUBLIC_URI),
    })
    standardCount.mockResolvedValue({data: {count: 4}})

    await expect(listNotifications(agent, {limit: 20})).resolves.toEqual(
      listBody(PUBLIC_URI),
    )
    await expect(getUnreadCount(agent, {priority: true})).resolves.toEqual({
      count: 4,
    })
    expect(standardList).toHaveBeenCalledWith(
      {limit: 20},
      HOME_APPVIEW_PINNED_OPTS,
    )
    expect(standardCount).toHaveBeenCalledWith(
      {priority: true},
      HOME_APPVIEW_PINNED_OPTS,
    )
  })

  it.each([
    [404, 'MethodNotImplemented'],
    [501, 'UnknownMethod'],
    [501, undefined],
    [403, 'Forbidden'],
    [503, 'UpstreamFailure'],
  ])('does not fall back for status %s and error %s', async (status, error) => {
    const {agent, fetchHandler, standardList} = mockAgent()
    fetchHandler.mockResolvedValue(
      new Response(JSON.stringify(error ? {error} : {}), {status}),
    )

    await expect(listNotifications(agent, {})).rejects.toEqual(
      expect.objectContaining<Partial<CommunityNotificationXrpcError>>({
        status,
        error,
      }),
    )
    expect(standardList).not.toHaveBeenCalled()
  })

  it('surfaces transport failures without fallback', async () => {
    const {agent, fetchHandler, standardList} = mockAgent()
    const error = new Error('offline')
    fetchHandler.mockRejectedValue(error)

    await expect(listNotifications(agent, {})).rejects.toBe(error)
    expect(standardList).not.toHaveBeenCalled()
  })

  it('validates and returns the custom unread count', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(new Response(JSON.stringify({count: 8})))

    await expect(getUnreadCount(agent)).resolves.toEqual({count: 8})
    expect(fetchHandler).toHaveBeenCalledWith(
      `/xrpc/${GET_UNREAD_COUNT_METHOD}`,
      expect.objectContaining({method: 'GET'}),
    )
  })
})
