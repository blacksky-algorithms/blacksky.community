import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

const mockFetchRecordViaSlingshot = jest.fn()

jest.mock('../microcosm-fallback', () => ({
  fetchRecordViaSlingshot: (...args: unknown[]) =>
    mockFetchRecordViaSlingshot(...args),
}))
jest.mock('#/state/queries', () => ({PERSISTED_QUERY_ROOT: 'PERSISTED'}))

import {
  forgetProfileEnrichment,
  useProfileEnrichment,
} from '../profile-enrichment'

const DID = 'did:plc:alice'
const NO_AVATAR_DID = 'did:plc:bob'
const AVATAR = `https://cdn.bsky.app/img/avatar/plain/${DID}/bafyavatar@jpeg`

type Author = {
  did: string
  handle: string
  displayName: string
  avatar?: string
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

describe('useProfileEnrichment', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockFetchRecordViaSlingshot.mockReset()
    mockFetchRecordViaSlingshot.mockImplementation((uri: string) =>
      Promise.resolve(
        uri.startsWith(`at://${DID}/`)
          ? {
              value: {
                displayName: 'Alice',
                avatar: {ref: {$link: 'bafyavatar'}},
              },
            }
          : {value: {}},
      ),
    )
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('patches the avatar into data that arrives after the first repair', async () => {
    const queryClient = mount()

    act(() => {
      queryClient.setQueryData(
        ['thread', 'a'],
        [post('at://a', emptyAuthor(DID))],
      )
    })
    await flush()
    expect(
      queryClient.getQueryData<Post[]>(['thread', 'a'])![0].author.avatar,
    ).toBe(AVATAR)

    act(() => {
      queryClient.setQueryData(
        ['thread', 'b'],
        [post('at://b', emptyAuthor(DID))],
      )
    })
    await flush()
    expect(
      queryClient.getQueryData<Post[]>(['thread', 'b'])![0].author.avatar,
    ).toBe(AVATAR)

    act(() => {
      queryClient.setQueryData(['profile', DID], emptyAuthor(DID))
    })
    expect(queryClient.getQueryData<Author>(['profile', DID])!.avatar).toBe(
      AVATAR,
    )

    expect(mockFetchRecordViaSlingshot).toHaveBeenCalledTimes(1)
  })

  it('treats a profile with a display name but no avatar as incomplete', async () => {
    const queryClient = mount()

    act(() => {
      queryClient.setQueryData(
        ['thread', 'a'],
        [post('at://a', emptyAuthor(DID, 'Alice'))],
      )
    })
    await flush()

    const author = queryClient.getQueryData<Post[]>(['thread', 'a'])![0].author
    expect(author.avatar).toBe(AVATAR)
    expect(author.displayName).toBe('Alice')
  })

  it('fetches a profile without an avatar once and remembers the miss', async () => {
    const queryClient = mount()

    act(() => {
      queryClient.setQueryData(
        ['thread', 'a'],
        [post('at://a', emptyAuthor(NO_AVATAR_DID, 'Bob'))],
      )
    })
    await flush()
    act(() => {
      queryClient.setQueryData(
        ['thread', 'b'],
        [post('at://b', emptyAuthor(NO_AVATAR_DID, 'Bob'))],
      )
    })
    await flush()

    expect(mockFetchRecordViaSlingshot).toHaveBeenCalledTimes(1)
    expect(
      queryClient.getQueryData<Post[]>(['thread', 'b'])![0].author.avatar,
    ).toBeUndefined()
  })

  it('refetches a profile after it is forgotten', async () => {
    const queryClient = mount()

    act(() => {
      queryClient.setQueryData(
        ['thread', 'a'],
        [post('at://a', emptyAuthor(DID))],
      )
    })
    await flush()
    forgetProfileEnrichment(DID)
    act(() => {
      queryClient.setQueryData(
        ['thread', 'b'],
        [post('at://b', emptyAuthor(DID))],
      )
    })
    expect(
      queryClient.getQueryData<Post[]>(['thread', 'b'])![0].author.avatar,
    ).toBeUndefined()
    await flush()

    expect(mockFetchRecordViaSlingshot).toHaveBeenCalledTimes(2)
  })
})
