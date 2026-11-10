import {createRef} from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render} from '@testing-library/react-native'

const mockRefreshFeed = jest.fn().mockResolvedValue(undefined)

jest.mock('@lingui/react', () => ({
  useLingui: () => ({_: (msg: {message?: string}) => msg?.message ?? ''}),
}))
jest.mock('@lingui/react/macro', () => ({
  Trans: ({children}: React.PropsWithChildren) => children,
}))
jest.mock('#/lib/hooks/useInitialNumToRender', () => ({
  useInitialNumToRender: () => 10,
}))
jest.mock('#/state/queries/post-feed', () => ({RQKEY: () => ['post-feed']}))
jest.mock('#/state/queries/util', () => ({truncateAndInvalidate: jest.fn()}))
jest.mock('#/view/com/posts/PostFeed', () => {
  const {useImperativeHandle} =
    jest.requireActual<typeof import('react')>('react')
  return {
    PostFeed: ({ref}: {ref: React.Ref<{refreshFeed: () => Promise<void>}>}) => {
      useImperativeHandle(ref, () => ({refreshFeed: mockRefreshFeed}))
      return null
    },
  }
})
jest.mock('#/view/com/util/EmptyState', () => ({EmptyState: () => null}))
jest.mock('#/view/com/util/listNativeTag', () => ({
  findListNativeTag: () => null,
}))
jest.mock('#/view/com/util/load-latest/LoadLatestBtn', () => ({
  LoadLatestBtn: () => null,
}))
jest.mock('#/alf', () => ({
  atoms: {},
  ios: (v: unknown) => v,
  useTheme: () => ({atoms: {}}),
}))
jest.mock('#/components/icons/EditBig', () => ({
  EditBig_Stroke1_Corner0_Rounded: () => null,
}))
jest.mock('#/components/Typography', () => ({Text: () => null}))

import {type ListMethods} from '#/view/com/util/List'
import {ProfileFeedSection} from '../Feed'
import {type SectionRef} from '../types'

function wrapper({children}: React.PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

describe('ProfileFeedSection refresh handle', () => {
  it('refreshes its own feed, whichever profile tab it backs', async () => {
    const ref = createRef<SectionRef>()

    render(
      <ProfileFeedSection
        ref={ref}
        feed="author|did:plc:test|posts_with_media"
        headerHeight={0}
        isFocused
        scrollElRef={createRef<ListMethods>()}
        setScrollViewTag={() => {}}
      />,
      {wrapper},
    )

    await ref.current?.refresh?.()

    expect(mockRefreshFeed).toHaveBeenCalledTimes(1)
  })
})
