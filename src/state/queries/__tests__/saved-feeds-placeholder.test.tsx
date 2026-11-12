import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook} from '@testing-library/react-native'

jest.mock('#/state/session', () => ({
  useAppviewClient: () => ({}),
  useSession: () => ({currentAccount: undefined}),
}))
jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: () => ({data: undefined, isLoading: true}),
}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: () => undefined,
}))
jest.mock('#/state/queries/community-membership', () => ({
  useCommunityMembership: () => ({data: undefined}),
}))
jest.mock('#/state/queries/list', () => ({RQKEY: () => ['list']}))
jest.mock('#/routes', () => ({router: {matchPath: () => undefined}}))

import {useSavedFeeds} from '../feed'

function wrapper({children}: React.PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {queries: {retry: false, structuralSharing: false}},
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useSavedFeeds placeholder', () => {
  it('keeps the same placeholder object across renders while preferences load', () => {
    const {result, rerender} = renderHook(() => useSavedFeeds(), {wrapper})

    const first = result.current.data
    expect(result.current.isPlaceholderData).toBe(true)
    expect(first).toEqual({count: 0, feeds: []})

    rerender({})
    rerender({})

    expect(result.current.data).toBe(first)
  })
})
