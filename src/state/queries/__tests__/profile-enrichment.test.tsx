import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockFetchRecord = jest.fn()

jest.mock('../microcosm-fallback', () => ({
  fetchRecordViaSlingshot: (...args: unknown[]) => mockFetchRecord(...args),
}))
jest.mock('#/state/queries', () => ({PERSISTED_QUERY_ROOT: 'PERSISTED'}))

import {
  forgetProfileEnrichment,
  useProfileEnrichment,
} from '../profile-enrichment'

const DID = 'did:plc:alice'
const MISSING_DID = 'did:plc:bob'
const AVATAR = `https://cdn.bsky.app/img/avatar/plain/${DID}/bafyavatar@jpeg`

type Author = {
  did: string
  handle: string
  displayName: string
  avatar?: string
  labels?: {val: string}[]
}
type Post = {uri: string; author: Author}

function post(uri: string, author: Author): Post {
  return {uri, author}
}

function emptyAuthor(did: string, displayName?: string): Author {
  const handle = `${did.slice(8)}.test`
  return {did, handle, displayName: displayName ?? handle}
}

function mount() {
  const queryClient = new QueryClient()
  renderHook(() => useProfileEnrichment(), {
    wrapper: ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  return queryClient
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(100)
    await Promise.resolve()
    await Promise.resolve()
  })
}

function avatarOf(queryClient: QueryClient, id: string, index = 0) {
  return queryClient.getQueryData<Post[]>(['thread', id])![index].author.avatar
}

function setThread(queryClient: QueryClient, id: string, posts: Post[]) {
  act(() => {
    queryClient.setQueryData(['thread', id], posts)
  })
}

describe('useProfileEnrichment', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockFetchRecord.mockReset()
    mockFetchRecord.mockImplementation((uri: string) =>
      Promise.resolve(
        uri.startsWith(`at://${DID}/`)
          ? {
              value: {
                displayName: 'Alice',
                avatar: {ref: {$link: 'bafyavatar'}},
              },
            }
          : null,
      ),
    )
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('patches the avatar into data that arrives after the first repair', async () => {
    const queryClient = mount()

    setThread(queryClient, 'a', [post('at://a', emptyAuthor(DID))])
    await flush()
    expect(avatarOf(queryClient, 'a')).toBe(AVATAR)

    setThread(queryClient, 'b', [post('at://b', emptyAuthor(DID))])
    await flush()
    expect(avatarOf(queryClient, 'b')).toBe(AVATAR)

    act(() => {
      queryClient.setQueryData(['profile', DID], emptyAuthor(DID))
    })
    expect(queryClient.getQueryData<Author>(['profile', DID])!.avatar).toBe(
      AVATAR,
    )

    expect(mockFetchRecord).toHaveBeenCalledTimes(1)
  })

  it('patches every reference to a shared profile object', async () => {
    const queryClient = mount()

    const author = emptyAuthor(DID)
    setThread(queryClient, 'a', [
      post('at://a', author),
      post('at://b', author),
    ])
    await flush()
    expect(avatarOf(queryClient, 'a', 0)).toBe(AVATAR)
    expect(avatarOf(queryClient, 'a', 1)).toBe(AVATAR)

    const author2 = emptyAuthor(DID)
    setThread(queryClient, 'b', [
      post('at://c', author2),
      post('at://d', author2),
    ])
    expect(avatarOf(queryClient, 'b', 0)).toBe(AVATAR)
    expect(avatarOf(queryClient, 'b', 1)).toBe(AVATAR)
  })

  it('does not fetch a profile that has a display name', async () => {
    const queryClient = mount()

    setThread(queryClient, 'a', [post('at://a', emptyAuthor(DID, 'Alice'))])
    await flush()

    expect(mockFetchRecord).not.toHaveBeenCalled()
  })

  it('remembers a profile record that does not exist', async () => {
    const queryClient = mount()

    setThread(queryClient, 'a', [post('at://a', emptyAuthor(MISSING_DID))])
    await flush()
    setThread(queryClient, 'b', [post('at://b', emptyAuthor(MISSING_DID))])
    await flush()

    expect(mockFetchRecord).toHaveBeenCalledTimes(1)
    expect(avatarOf(queryClient, 'b')).toBeUndefined()
  })

  it('remembers a failed fetch as a miss and does not refetch', async () => {
    const queryClient = mount()
    mockFetchRecord.mockRejectedValueOnce(new Error('ServerError'))

    setThread(queryClient, 'a', [post('at://a', emptyAuthor(DID))])
    await flush()
    expect(avatarOf(queryClient, 'a')).toBeUndefined()

    setThread(queryClient, 'b', [post('at://b', emptyAuthor(DID))])
    await flush()
    expect(avatarOf(queryClient, 'b')).toBeUndefined()
    expect(mockFetchRecord).toHaveBeenCalledTimes(1)
  })

  it('never enriches a taken-down profile', async () => {
    const queryClient = mount()

    const takenDown = {...emptyAuthor(DID), labels: [{val: '!takedown'}]}
    setThread(queryClient, 'a', [post('at://a', takenDown)])
    await flush()
    expect(mockFetchRecord).not.toHaveBeenCalled()

    setThread(queryClient, 'b', [
      post('at://b', emptyAuthor(DID)),
      post('at://c', takenDown),
    ])
    await flush()
    expect(avatarOf(queryClient, 'b', 0)).toBe(AVATAR)
    expect(avatarOf(queryClient, 'b', 1)).toBeUndefined()
  })

  it('keeps the original dataUpdatedAt', async () => {
    const queryClient = mount()

    act(() => {
      queryClient.setQueryData(
        ['thread', 'a'],
        [post('at://a', emptyAuthor(DID))],
        {updatedAt: 1000},
      )
    })
    await flush()

    expect(avatarOf(queryClient, 'a')).toBe(AVATAR)
    expect(queryClient.getQueryState(['thread', 'a'])!.dataUpdatedAt).toBe(1000)
  })

  it('refetches a profile after it is forgotten', async () => {
    const queryClient = mount()

    setThread(queryClient, 'a', [post('at://a', emptyAuthor(DID))])
    await flush()
    forgetProfileEnrichment(DID)
    setThread(queryClient, 'b', [post('at://b', emptyAuthor(DID))])
    expect(avatarOf(queryClient, 'b')).toBeUndefined()
    await flush()

    expect(mockFetchRecord).toHaveBeenCalledTimes(2)
  })
})
