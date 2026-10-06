import {type AtpAgent} from '@atproto/api'
import {QueryClient} from '@tanstack/react-query'

const mockListNotifications = jest.fn()

jest.mock('#/lib/api/community-notifications', () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
}))
jest.mock('#/state/queries/profile', () => ({precacheProfile: jest.fn()}))

import {fetchPage} from '../util'

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const PRIVATE_URI = `${SPACE}/did:plc:alice/app.bsky.feed.post/3kprivate`

describe(fetchPage, () => {
  const agent = {} as AtpAgent
  const queryClient = new QueryClient()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('converts a private notification from the custom ordered stream', async () => {
    mockListNotifications.mockResolvedValue({
      cursor: 'next',
      priority: false,
      seenAt: '2026-09-01T00:00:00.000Z',
      notifications: [
        {
          uri: PRIVATE_URI,
          cid: 'bafyreiacsg6vsw7ppwbnowzsdgstulhrwftirtcnvkcbnfgvhwjrnzfmsu',
          author: {did: 'did:plc:alice', handle: 'alice.test'},
          reason: 'mention',
          reasonSubject: PRIVATE_URI,
          record: {$type: 'app.bsky.feed.post', text: 'private'},
          isRead: false,
          indexedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })

    const result = await fetchPage({
      agent,
      cursor: undefined,
      limit: 30,
      queryClient,
      moderationOpts: undefined,
      hideFollowNotifications: undefined,
      fetchAdditionalData: false,
      reasons: [],
    })

    expect(mockListNotifications).toHaveBeenCalledWith(agent, {
      limit: 30,
      cursor: undefined,
      reasons: [],
    })
    expect(result.page.cursor).toBe('next')
    expect(result.page.items).toHaveLength(1)
    expect(result.page.items[0].subjectUri).toBe(PRIVATE_URI)
  })

  it('preserves a cursor on an empty mentions page', async () => {
    mockListNotifications.mockResolvedValue({
      cursor: 'continue',
      notifications: [],
    })

    const result = await fetchPage({
      agent,
      cursor: 'before',
      limit: 30,
      queryClient,
      moderationOpts: undefined,
      hideFollowNotifications: undefined,
      fetchAdditionalData: false,
      reasons: ['mention', 'reply', 'quote'],
    })

    expect(result.page).toMatchObject({cursor: 'continue', items: []})
    expect(mockListNotifications).toHaveBeenCalledWith(
      agent,
      expect.objectContaining({
        cursor: 'before',
        reasons: ['mention', 'reply', 'quote'],
      }),
    )
  })
})
