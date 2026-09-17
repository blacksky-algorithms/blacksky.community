import {type ReactNode} from 'react'
import {type AppBskyFeedDefs} from '@atproto/api'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook, waitFor} from '@testing-library/react-native'

import {usePostQuotesQuery} from '#/state/queries/post-quotes'
import {useAgent} from '#/state/session'

jest.mock('#/state/session', () => ({useAgent: jest.fn()}))
jest.mock('#/lib/api/community', () => ({getSpacePostQuotes: jest.fn()}))

const subject = 'at://did:plc:subject/app.bsky.feed.post/subject'
const quote = (id: string) =>
  ({
    uri: `at://did:plc:author/app.bsky.feed.post/${id}`,
  }) as AppBskyFeedDefs.PostView

it('stops the repeated quote cursor and displays each post once', async () => {
  const first = quote('first')
  const tail = quote('tail')
  const getQuotes = jest
    .fn()
    .mockResolvedValueOnce({
      data: {posts: [first, tail], cursor: 'tail-cursor'},
    })
    .mockResolvedValue({data: {posts: [tail], cursor: 'tail-cursor'}})
  jest.mocked(useAgent).mockReturnValue({
    api: {app: {bsky: {feed: {getQuotes}}}},
  } as unknown as ReturnType<typeof useAgent>)
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
  const wrapper = ({children}: {children: ReactNode}) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const {result, unmount} = renderHook(() => usePostQuotesQuery(subject), {
    wrapper,
  })
  try {
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    expect(result.current.data?.pages.flatMap(page => page.posts)).toEqual([
      first,
      tail,
    ])
    expect(getQuotes).toHaveBeenCalledTimes(2)
    expect(getQuotes).toHaveBeenLastCalledWith({
      uri: subject,
      limit: 30,
      cursor: 'tail-cursor',
    })
  } finally {
    unmount()
    client.clear()
  }
})
