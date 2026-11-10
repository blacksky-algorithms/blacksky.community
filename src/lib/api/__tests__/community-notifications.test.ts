// The repo-wide stub of this module rejects every CID the client validates.
jest.unmock('multiformats/cid')

import {HOME_PROXY_HEADER} from '#/lib/constants'
import {createLexClient} from '#/lib/lexClient'
import {getErrorName, getErrorStatus} from '#/lib/xrpc-error'
import {
  GET_GROUPED_NOTIFICATIONS_METHOD,
  GET_UNREAD_COUNT_METHOD,
  getGroupedNotifications,
  getUnreadCount,
  LIST_NOTIFICATIONS_METHOD,
  listNotifications,
} from '../community-notifications'

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const PRIVATE_URI = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kprivate`
const PUBLIC_URI = 'at://did:plc:alice/app.bsky.feed.post/3kpublic'
const CID = 'bafyreiacsg6vsw7ppwbnowzsdgstulhrwftirtcnvkcbnfgvhwjrnzfmsu'
const STANDARD_LIST = 'app.bsky.notification.listNotifications'
const STANDARD_COUNT = 'app.bsky.notification.getUnreadCount'
const STANDARD_GROUPED = 'app.bsky.notification.getGroupedNotifications'

function groupedBody(method: string, post: string, postViewType: string) {
  return {
    cursor: 'next',
    groups: [
      {
        $type: `${method}#group`,
        id: 'like-1',
        isRead: false,
        indexedAt: '2026-09-01T00:00:00.000Z',
        count: 1,
        kind: {
          $type: `${method}#likeGroup`,
          post,
          items: [{actor: 'did:plc:alice'}],
        },
      },
    ],
    relatedViews: [
      {
        $type: 'app.bsky.actor.defs#profileViewBasic',
        did: 'did:plc:alice',
        handle: 'alice.test',
      },
      {
        $type: postViewType,
        uri: post,
        cid: CID,
        author: {did: 'did:plc:me', handle: 'me.test'},
        record: {
          $type: 'app.bsky.feed.post',
          text: 'hello',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
        indexedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  }
}

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  })
}

function unsupported() {
  return json({error: 'MethodNotImplemented', message: 'not here'}, 501)
}

function mockClient() {
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
  const client = createLexClient({fetchHandler})
  const request = (call: number) => {
    const [path, init] = fetchHandler.mock.calls[call]
    return {
      method: path.slice('/xrpc/'.length).split('?')[0],
      query: new URLSearchParams(path.split('?')[1] ?? ''),
      proxy: new Headers(init.headers).get('atproto-proxy'),
    }
  }
  return {client, fetchHandler, request}
}

describe('community notification API', () => {
  it('reads notifications on space records from the home appview', async () => {
    const {client, fetchHandler, request} = mockClient()
    const body = listBody()
    fetchHandler.mockResolvedValue(json(body))

    await expect(
      listNotifications(client, {limit: 30, reasons: ['mention']}),
    ).resolves.toEqual(body)

    expect(fetchHandler).toHaveBeenCalledTimes(1)
    expect(request(0).method).toBe(LIST_NOTIFICATIONS_METHOD)
    expect(request(0).query.get('limit')).toBe('30')
    expect(request(0).query.getAll('reasons')).toEqual(['mention'])
    expect(request(0).proxy).toBe(HOME_PROXY_HEADER)
  })

  it('returns public notifications unchanged', async () => {
    const {client, fetchHandler} = mockClient()
    const body = listBody(PUBLIC_URI)
    fetchHandler.mockResolvedValue(json(body))

    await expect(listNotifications(client, {limit: 30})).resolves.toEqual(body)
  })

  it('falls back only for a 501 MethodNotImplemented response', async () => {
    const {client, fetchHandler, request} = mockClient()
    fetchHandler
      .mockResolvedValueOnce(unsupported())
      .mockResolvedValueOnce(json(listBody(PUBLIC_URI)))
      .mockResolvedValueOnce(unsupported())
      .mockResolvedValueOnce(json({count: 4}))

    await expect(listNotifications(client, {limit: 20})).resolves.toEqual(
      listBody(PUBLIC_URI),
    )
    await expect(getUnreadCount(client, {priority: true})).resolves.toEqual({
      count: 4,
    })

    expect(fetchHandler).toHaveBeenCalledTimes(4)
    expect(request(1).method).toBe(STANDARD_LIST)
    expect(request(1).query.get('limit')).toBe('20')
    expect(request(1).proxy).toBe(HOME_PROXY_HEADER)
    expect(request(3).method).toBe(STANDARD_COUNT)
    expect(request(3).query.get('priority')).toBe('true')
    expect(request(3).proxy).toBe(HOME_PROXY_HEADER)
  })

  it.each([
    [404, 'MethodNotImplemented'],
    [501, 'UnknownMethod'],
    [403, 'Forbidden'],
    [503, 'UpstreamFailure'],
  ])('does not fall back for status %s and error %s', async (status, error) => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(json({error, message: error}, status))

    const failure: unknown = await listNotifications(client, {limit: 30}).catch(
      (e: unknown) => e,
    )

    expect(getErrorStatus(failure)).toBe(status)
    expect(getErrorName(failure)).toBe(error)
    expect(fetchHandler).toHaveBeenCalledTimes(1)
  })

  it('does not fall back for a 501 that names no error', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockResolvedValue(json({}, 501))

    await expect(listNotifications(client, {limit: 30})).rejects.toBeDefined()
    expect(fetchHandler).toHaveBeenCalledTimes(1)
  })

  it('surfaces transport failures without fallback', async () => {
    const {client, fetchHandler} = mockClient()
    fetchHandler.mockRejectedValue(new Error('offline'))

    await expect(listNotifications(client, {limit: 30})).rejects.toBeDefined()
    expect(fetchHandler).toHaveBeenCalledTimes(1)
  })

  it('reads grouped notifications on space records in the standard shape', async () => {
    const {client, fetchHandler, request} = mockClient()
    fetchHandler.mockResolvedValue(
      json(
        groupedBody(
          GET_GROUPED_NOTIFICATIONS_METHOD,
          PRIVATE_URI,
          'community.blacksky.feed.defs#spacePostView',
        ),
      ),
    )

    await expect(
      getGroupedNotifications(client, {feed: 'all', limit: 30}),
    ).resolves.toEqual(
      groupedBody(STANDARD_GROUPED, PRIVATE_URI, 'app.bsky.feed.defs#postView'),
    )

    expect(fetchHandler).toHaveBeenCalledTimes(1)
    expect(request(0).method).toBe(GET_GROUPED_NOTIFICATIONS_METHOD)
    expect(request(0).query.get('feed')).toBe('all')
    expect(request(0).proxy).toBe(HOME_PROXY_HEADER)
  })

  it('falls back to the standard grouped notifications on the home appview', async () => {
    const {client, fetchHandler, request} = mockClient()
    const body = groupedBody(
      STANDARD_GROUPED,
      PUBLIC_URI,
      'app.bsky.feed.defs#postView',
    )
    fetchHandler
      .mockResolvedValueOnce(unsupported())
      .mockResolvedValueOnce(json(body))

    await expect(
      getGroupedNotifications(client, {feed: 'followers', limit: 1}),
    ).resolves.toEqual(body)

    expect(request(1).method).toBe(STANDARD_GROUPED)
    expect(request(1).query.get('feed')).toBe('followers')
    expect(request(1).proxy).toBe(HOME_PROXY_HEADER)
  })

  it('returns the community unread count', async () => {
    const {client, fetchHandler, request} = mockClient()
    fetchHandler.mockResolvedValue(json({count: 8}))

    await expect(getUnreadCount(client)).resolves.toEqual({count: 8})
    expect(request(0).method).toBe(GET_UNREAD_COUNT_METHOD)
    expect(request(0).proxy).toBe(HOME_PROXY_HEADER)
  })
})
