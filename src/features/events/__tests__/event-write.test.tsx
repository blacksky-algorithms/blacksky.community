import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockPutRecord = jest.fn()
const mockDeleteRecord = jest.fn()

jest.mock('#/analytics', () => ({useAnalytics: () => ({metric: jest.fn()})}))
jest.mock('#/state/session', () => ({
  useAgent: () => ({
    com: {
      atproto: {
        repo: {putRecord: mockPutRecord, deleteRecord: mockDeleteRecord},
      },
    },
  }),
  useSession: () => ({currentAccount: {did: 'did:plc:host'}}),
}))
jest.mock('#/lib/api/community', () => ({communityXrpc: jest.fn()}))
jest.mock('#/state/queries', () => ({STALE: {MINUTES: {ONE: 60e3}}}))

import {EVENT_RQKEY, useEventWriteMutation} from '../queries'
import {type EventView} from '../types'

const URI = 'at://did:plc:host/community.lexicon.calendar.event/3kevent'
const event: EventView = {
  uri: URI,
  cid: 'cid',
  creator: {did: 'did:plc:host', handle: 'host.test'},
  record: {name: 'Party', createdAt: '2027-01-01T00:00:00.000Z'},
  goingCount: 2,
  interestedCount: 0,
  indexedAt: '',
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}},
  })
  queryClient.setQueryData(EVENT_RQKEY(URI), event)
  const {result} = renderHook(() => useEventWriteMutation(event), {
    wrapper: ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  return {queryClient, result}
}

describe('useEventWriteMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPutRecord.mockResolvedValue({})
    mockDeleteRecord.mockResolvedValue({})
  })

  it('replaces the record at the same address and caches it', async () => {
    const {queryClient, result} = setup()
    const next = {...(event.record as object), status: 'x#cancelled'}

    await act(() => result.current.mutateAsync(next))

    expect(mockPutRecord).toHaveBeenCalledWith({
      repo: 'did:plc:host',
      collection: 'community.lexicon.calendar.event',
      rkey: '3kevent',
      record: next,
    })
    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toEqual({
      ...event,
      record: next,
    })
  })

  it('deletes the record and clears it from the cache', async () => {
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync(null))

    expect(mockDeleteRecord).toHaveBeenCalledWith({
      repo: 'did:plc:host',
      collection: 'community.lexicon.calendar.event',
      rkey: '3kevent',
    })
    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toBeNull()
  })

  it('leaves the cache alone when the write fails', async () => {
    mockDeleteRecord.mockRejectedValue(new Error('offline'))
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync(null).catch(() => {}))

    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toEqual(event)
  })
})
