import {type BskyAgent} from '@atproto/api'

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  jsonToLex: (value: unknown) => value,
}))
jest.mock('#/state/session', () => ({useAgent: jest.fn()}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: jest.fn(),
}))
jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: jest.fn(),
}))

import {
  fetchCommunityTimelinePage,
  TIMELINE_RQKEY,
  TIMELINE_RQKEY_ROOT,
} from '../community-feed'

function mockAgent() {
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
  fetchHandler.mockResolvedValue(
    new Response(JSON.stringify({cursor: 'next', feed: []})),
  )
  return {agent: {fetchHandler} as unknown as BskyAgent, fetchHandler}
}

function requestedParams(
  fetchHandler: jest.Mock<Promise<Response>, [string, RequestInit]>,
) {
  const path = fetchHandler.mock.calls[0][0]
  return new URL(path, 'https://example.test').searchParams
}

describe('fetchCommunityTimelinePage', () => {
  it('sends the same request as before for the recent sort', async () => {
    const {agent, fetchHandler} = mockAgent()

    await fetchCommunityTimelinePage(agent, {limit: 30, sort: 'recent'})

    const params = requestedParams(fetchHandler)
    expect(params.get('limit')).toBe('30')
    expect(params.has('sort')).toBe(false)
    expect(params.has('cursor')).toBe(false)
  })

  it('sends the hot sort together with its cursor', async () => {
    const {agent, fetchHandler} = mockAgent()

    await fetchCommunityTimelinePage(agent, {
      limit: 30,
      cursor: '2026-09-03T00:00:00.000Z::123::bafycid',
      sort: 'hot',
    })

    const params = requestedParams(fetchHandler)
    expect(params.get('sort')).toBe('hot')
    expect(params.get('cursor')).toBe('2026-09-03T00:00:00.000Z::123::bafycid')
  })

  it('returns the page cursor', async () => {
    const {agent} = mockAgent()

    const page = await fetchCommunityTimelinePage(agent, {
      limit: 30,
      sort: 'hot',
    })

    expect(page.cursor).toBe('next')
    expect(page.feed).toEqual([])
  })

  it('throws on a non-2xx response', async () => {
    const {agent, fetchHandler} = mockAgent()
    fetchHandler.mockResolvedValue(new Response('{}', {status: 500}))

    await expect(
      fetchCommunityTimelinePage(agent, {limit: 30, sort: 'recent'}),
    ).rejects.toThrow('getCommunityTimeline failed: 500')
  })
})

describe('TIMELINE_RQKEY', () => {
  it('keys each sort separately under the shared root', () => {
    expect(TIMELINE_RQKEY()).toEqual([TIMELINE_RQKEY_ROOT, 'recent'])
    expect(TIMELINE_RQKEY('hot')).toEqual([TIMELINE_RQKEY_ROOT, 'hot'])
    expect(TIMELINE_RQKEY('hot')).not.toEqual(TIMELINE_RQKEY('recent'))
  })
})
