import {type PropsWithChildren} from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

import {until} from '#/lib/async/until'
import {useAppviewClient, usePdsClient} from '#/state/session'
import {app} from '#/lexicons'
import {useListBlockMutation} from '../list'

jest.mock('#/lib/async/until', () => ({until: jest.fn()}))
jest.mock('#/lib/api', () => ({uploadBlob: jest.fn()}))
jest.mock('../feed', () => ({FEED_INFO_RQKEY_ROOT: 'feed-info'}))
jest.mock('../my-lists', () => ({invalidate: jest.fn()}))
jest.mock('../profile-lists', () => ({RQKEY: jest.fn()}))
jest.mock('#/state/session', () => ({
  useAppviewClient: jest.fn(),
  usePdsClient: jest.fn(),
  useSession: jest.fn(),
}))

const LIST = 'at://did:plc:creator/app.bsky.graph.list/list'
const BLOCK = 'at://did:plc:viewer/app.bsky.graph.listblock/3kblock'

function setup(blocked?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {gcTime: Infinity, retry: false},
      mutations: {gcTime: Infinity, retry: false},
    },
  })
  const pdsClient = {call: jest.fn(), delete: jest.fn()}
  const appviewClient = {
    call: jest.fn().mockResolvedValue({list: {uri: LIST, viewer: {blocked}}}),
  }
  jest.mocked(usePdsClient).mockReturnValue(pdsClient as never)
  jest.mocked(useAppviewClient).mockReturnValue(appviewClient as never)
  jest.mocked(until).mockResolvedValue(true)
  const wrapper = ({children}: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useListBlockMutation(), {wrapper})
  return {hook, pdsClient, appviewClient}
}

beforeEach(() => jest.clearAllMocks())

describe('useListBlockMutation', () => {
  it('finds the block on the appview and deletes it on the account server', async () => {
    const {hook, pdsClient, appviewClient} = setup(BLOCK)

    await act(() => hook.result.current.mutateAsync({uri: LIST, block: false}))

    expect(appviewClient.call).toHaveBeenCalledWith(app.bsky.graph.getList, {
      list: LIST,
      limit: 1,
    })
    expect(pdsClient.call).not.toHaveBeenCalled()
    expect(pdsClient.delete).toHaveBeenCalledWith(app.bsky.graph.listblock, {
      rkey: '3kblock',
    })
  })

  it('deletes nothing when the list is not blocked', async () => {
    const {hook, pdsClient} = setup(undefined)

    await act(() => hook.result.current.mutateAsync({uri: LIST, block: false}))

    expect(pdsClient.delete).not.toHaveBeenCalled()
  })

  it('creates the block on the account server', async () => {
    const {hook, pdsClient, appviewClient} = setup(undefined)

    await act(() => hook.result.current.mutateAsync({uri: LIST, block: true}))

    expect(pdsClient.call).toHaveBeenCalledTimes(1)
    expect(pdsClient.call).toHaveBeenCalledWith(expect.anything(), {
      list: LIST,
    })
    expect(appviewClient.call).not.toHaveBeenCalled()
  })
})
