import {ComAtprotoRepoPutRecord} from '@atproto/api'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockGetRecord = jest.fn()
const mockPutRecord = jest.fn()
const mockDeleteRecord = jest.fn()

jest.mock('#/analytics', () => ({useAnalytics: () => ({metric: jest.fn()})}))
jest.mock('#/state/session', () => ({
  useAgent: () => ({
    com: {
      atproto: {
        repo: {
          getRecord: mockGetRecord,
          putRecord: mockPutRecord,
          deleteRecord: mockDeleteRecord,
        },
      },
    },
  }),
  useSession: () => ({currentAccount: {did: 'did:plc:host'}}),
}))
jest.mock('#/lib/api/community', () => ({communityXrpc: jest.fn()}))
jest.mock('#/state/queries', () => ({STALE: {MINUTES: {ONE: 60e3}}}))

import {EVENT_RQKEY, EventGoneError, useEventWriteMutation} from '../queries'
import {type EventView} from '../types'

const URI = 'at://did:plc:host/community.lexicon.calendar.event/3kevent'
const COORDS = {
  repo: 'did:plc:host',
  collection: 'community.lexicon.calendar.event',
  rkey: '3kevent',
}
const event: EventView = {
  uri: URI,
  cid: 'cid',
  creator: {did: 'did:plc:host', handle: 'host.test'},
  record: {name: 'Stale copy'},
  goingCount: 2,
  interestedCount: 0,
  indexedAt: '',
}
const cancel = (current: Record<string, unknown>) => ({
  ...current,
  status: 'cancelled',
})

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}},
  })
  queryClient.setQueryData(EVENT_RQKEY(URI), event)
  const {result} = renderHook(() => useEventWriteMutation(URI), {
    wrapper: ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  return {queryClient, result}
}

describe('useEventWriteMutation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetRecord.mockResolvedValue({
      data: {cid: 'fresh-cid', value: {name: 'Fresh copy'}},
    })
    mockPutRecord.mockResolvedValue({})
    mockDeleteRecord.mockResolvedValue({})
  })

  it('updates the PDS copy of the record, only if it is still current', async () => {
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync(cancel))

    const next = {name: 'Fresh copy', status: 'cancelled'}
    expect(mockGetRecord).toHaveBeenCalledWith(COORDS)
    expect(mockPutRecord).toHaveBeenCalledWith({
      ...COORDS,
      record: next,
      swapRecord: 'fresh-cid',
    })
    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toEqual({
      ...event,
      record: next,
    })
  })

  it('re-reads and retries when another write got there first', async () => {
    mockPutRecord
      .mockRejectedValueOnce(
        new ComAtprotoRepoPutRecord.InvalidSwapError(
          new Error('swap') as never,
        ),
      )
      .mockResolvedValue({})
    const {result} = setup()

    await act(() => result.current.mutateAsync(cancel))

    expect(mockGetRecord).toHaveBeenCalledTimes(2)
    expect(mockPutRecord).toHaveBeenCalledTimes(2)
  })

  it('does not recreate an event that has been deleted', async () => {
    mockGetRecord.mockRejectedValue(
      new Error(`Could not locate record: ${URI}`),
    )
    const {result} = setup()

    let error: unknown
    await act(() =>
      result.current.mutateAsync(cancel).catch(e => {
        error = e
      }),
    )

    expect(error).toBeInstanceOf(EventGoneError)
    expect(mockPutRecord).not.toHaveBeenCalled()
  })

  it('reports other read failures without treating them as deleted', async () => {
    mockGetRecord.mockRejectedValue(new Error('offline'))
    const {result} = setup()

    let error: unknown
    await act(() =>
      result.current.mutateAsync(cancel).catch(e => {
        error = e
      }),
    )

    expect(error).not.toBeInstanceOf(EventGoneError)
    expect(mockPutRecord).not.toHaveBeenCalled()
  })

  it('deletes the record and clears it from the cache', async () => {
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync(null))

    expect(mockDeleteRecord).toHaveBeenCalledWith(COORDS)
    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toBeNull()
  })

  it('leaves the cache alone when the write fails', async () => {
    mockDeleteRecord.mockRejectedValue(new Error('offline'))
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync(null).catch(() => {}))

    expect(queryClient.getQueryData(EVENT_RQKEY(URI))).toEqual(event)
  })
})
