import {type PropsWithChildren} from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'

import {useGetTrendsQuery} from '../useGetTrendsQuery'

jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: () => ({data: {moderationPrefs: {mutedWords: []}}}),
}))
jest.mock('#/state/preferences/languages', () => ({
  getContentLanguages: () => ['en'],
}))
jest.mock('#/lib/api/feed/utils', () => ({
  aggregateUserInterests: () => '',
  createBskyTopicsHeader: () => ({}),
}))
jest.mock('#/logger', () => ({logger: {debug: jest.fn()}}))

const trends = Array.from({length: 12}, (_, i) => ({
  topic: `topic-${i}`,
  displayName: `Topic ${i}`,
  link: `/topic/${i}`,
}))

describe('useGetTrendsQuery', () => {
  const originalFetch = globalThis.fetch
  const mockFetch = jest.fn<Promise<Response>, [string]>()

  beforeEach(() => {
    mockFetch.mockReset().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({recIdStr: 'rec', trends}), {
          status: 200,
        }),
      ),
    )
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('asks for the shared fetch limit, so a small display limit does not starve a larger one', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: Infinity}},
    })
    const wrapper = ({children}: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const small = renderHook(() => useGetTrendsQuery({limit: 3}), {wrapper})
    await waitFor(() => expect(small.result.current.data).toBeDefined())
    const large = renderHook(() => useGetTrendsQuery({limit: 10}), {wrapper})
    await waitFor(() => expect(large.result.current.data).toBeDefined())

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.searchParams.get('limit')).toBe('20')
    expect(small.result.current.data?.trends).toHaveLength(3)
    expect(large.result.current.data?.trends).toHaveLength(10)
  })
})
