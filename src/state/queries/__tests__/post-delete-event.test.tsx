import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockApplyWrites = jest.fn()
const mockDeletePost = jest.fn()

jest.mock('#/state/session', () => ({
  useAgent: () => ({
    deletePost: mockDeletePost,
    com: {atproto: {repo: {applyWrites: mockApplyWrites}}},
  }),
  useSession: () => ({currentAccount: {did: 'did:plc:me'}}),
}))

import {EVENT_RQKEY} from '#/features/events/queries'
import {usePostDeleteMutation} from '../post'

const POST = 'at://did:plc:me/app.bsky.feed.post/3kpost'
const EVENT = 'at://did:plc:me/community.lexicon.calendar.event/3kevent'

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}},
  })
  queryClient.setQueryData(EVENT_RQKEY(EVENT), {uri: EVENT})
  const {result} = renderHook(() => usePostDeleteMutation(), {
    wrapper: ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  return {queryClient, result}
}

describe('usePostDeleteMutation with an event', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApplyWrites.mockResolvedValue({})
    mockDeletePost.mockResolvedValue({})
  })

  it('deletes the post and event in one write', async () => {
    const {queryClient, result} = setup()

    await act(() => result.current.mutateAsync({uri: POST, eventUri: EVENT}))

    expect(mockApplyWrites).toHaveBeenCalledTimes(1)
    expect(mockApplyWrites).toHaveBeenCalledWith({
      repo: 'did:plc:me',
      writes: [
        {
          $type: 'com.atproto.repo.applyWrites#delete',
          collection: 'app.bsky.feed.post',
          rkey: '3kpost',
        },
        {
          $type: 'com.atproto.repo.applyWrites#delete',
          collection: 'community.lexicon.calendar.event',
          rkey: '3kevent',
        },
      ],
    })
    expect(mockDeletePost).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(EVENT_RQKEY(EVENT))).toBeNull()
  })

  it('keeps the event when the write fails', async () => {
    mockApplyWrites.mockRejectedValue(new Error('offline'))
    const {queryClient, result} = setup()

    await act(() =>
      result.current.mutateAsync({uri: POST, eventUri: EVENT}).catch(() => {}),
    )

    expect(queryClient.getQueryData(EVENT_RQKEY(EVENT))).toEqual({uri: EVENT})
  })

  it('deletes only the post when no event is given', async () => {
    const {result} = setup()

    await act(() => result.current.mutateAsync({uri: POST}))

    expect(mockDeletePost).toHaveBeenCalledWith(POST)
    expect(mockApplyWrites).not.toHaveBeenCalled()
  })
})
