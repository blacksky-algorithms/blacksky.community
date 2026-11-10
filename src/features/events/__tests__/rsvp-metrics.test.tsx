import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockMetric = jest.fn()
const mockCreateRecord = jest.fn()
const mockPutRecord = jest.fn()
const mockDeleteRecord = jest.fn()

jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: mockMetric}),
}))
jest.mock('#/state/session', () => ({
  usePdsClient: () => ({
    call: (method: unknown, input: unknown) => {
      const {com} = jest.requireActual<typeof import('#/lexicons')>('#/lexicons')
      if (method === com.atproto.repo.createRecord) {
        return mockCreateRecord(input)
      }
      if (method === com.atproto.repo.putRecord) return mockPutRecord(input)
      if (method === com.atproto.repo.deleteRecord) {
        return mockDeleteRecord(input)
      }
      throw new Error('unexpected call')
    },
  }),
  useSession: () => ({currentAccount: {did: 'did:plc:me'}}),
}))
jest.mock('#/lib/api/community', () => ({communityXrpc: jest.fn()}))
jest.mock('#/state/queries', () => ({STALE: {MINUTES: {ONE: 60e3}}}))

import {useRsvpMutation} from '../queries'
import {
  type EventView,
  RSVP_GOING,
  RSVP_INTERESTED,
  type RsvpStatus,
} from '../types'

const EVENT_URI = 'at://did:plc:host/community.lexicon.calendar.event/1'
const RSVP_URI = 'at://did:plc:me/community.lexicon.calendar.rsvp/1'

const event: EventView = {
  uri: EVENT_URI,
  cid: 'cid',
  creator: {did: 'did:plc:host', handle: 'host.test'},
  record: {},
  goingCount: 0,
  interestedCount: 0,
  indexedAt: '',
}

async function rsvp(
  status: RsvpStatus,
  current?: {uri: string; status: string},
) {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}},
  })
  const {result} = renderHook(() => useRsvpMutation(event, 'EventPage'), {
    wrapper: ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  await act(async () => {
    await result.current.mutateAsync({status, current}).catch(() => {})
  })
}

describe('RSVP metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateRecord.mockResolvedValue({uri: RSVP_URI})
    mockPutRecord.mockResolvedValue({uri: RSVP_URI})
    mockDeleteRecord.mockResolvedValue({})
  })

  it('logs a new RSVP', async () => {
    await rsvp(RSVP_GOING)
    expect(mockMetric).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledWith('event:rsvp', {
      uri: EVENT_URI,
      hostDid: 'did:plc:host',
      status: 'going',
      previousStatus: undefined,
      logContext: 'EventPage',
    })
  })

  it('logs a changed RSVP with the previous status', async () => {
    await rsvp(RSVP_GOING, {uri: RSVP_URI, status: RSVP_INTERESTED})
    expect(mockMetric).toHaveBeenCalledWith(
      'event:rsvp',
      expect.objectContaining({status: 'going', previousStatus: 'interested'}),
    )
  })

  it('logs a removed RSVP', async () => {
    await rsvp(RSVP_GOING, {uri: RSVP_URI, status: RSVP_GOING})
    expect(mockMetric).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledWith('event:rsvp:remove', {
      uri: EVENT_URI,
      hostDid: 'did:plc:host',
      status: 'going',
      logContext: 'EventPage',
    })
  })

  it('logs nothing when the write fails', async () => {
    mockCreateRecord.mockRejectedValue(new Error('offline'))
    await rsvp(RSVP_GOING)
    expect(mockMetric).not.toHaveBeenCalled()
  })
})
