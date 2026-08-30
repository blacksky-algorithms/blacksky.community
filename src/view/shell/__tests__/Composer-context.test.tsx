import {render} from '@testing-library/react-native'

const mockComposePost = jest.fn((_props: Record<string, unknown>) => null)
const mockUseComposerState = jest.fn()

jest.mock('#/state/shell/composer', () => ({
  useComposerState: () => mockUseComposerState(),
}))
jest.mock('#/view/com/composer/Composer', () => ({
  ComposePost: (props: Record<string, unknown>) => mockComposePost(props),
  useComposerCancelRef: () => ({current: null}),
}))
jest.mock('#/components/Tooltip', () => ({
  SheetCompatProvider: ({children}: {children: React.ReactNode}) => children,
}))
jest.mock('#/alf', () => ({
  atoms: {absolute: {}, inset_0: {}},
  useTheme: () => ({name: 'light', atoms: {bg: {}}}),
}))
jest.mock('react-native-edge-to-edge', () => ({
  SystemBars: {
    pushStackEntry: jest.fn(() => ({})),
    popStackEntry: jest.fn(),
  },
}))
jest.mock('react-native-reanimated', () => {
  const {View} = require('react-native')
  const animation = {duration: () => animation, easing: () => animation}
  return {
    __esModule: true,
    default: {View},
    Easing: {out: jest.fn(), in: jest.fn(), exp: {}, quad: {}},
    SlideInDown: animation,
    SlideOutDown: animation,
  }
})

import {Composer} from '../Composer'

describe('Composer selected feed context', () => {
  it('forwards the contextual private feed into ComposePost', () => {
    const target = {
      feed: 'at://did:plc:test/app.bsky.feed.generator/private',
      name: 'Private Test',
    }
    mockUseComposerState.mockReturnValue({
      text: 'hello',
      contextualCommunityFeedTarget: target,
    })

    render(<Composer />)

    expect(mockComposePost).toHaveBeenCalledWith(
      expect.objectContaining({contextualCommunityFeedTarget: target}),
    )
  })
})
