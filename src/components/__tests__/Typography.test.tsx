import type * as ReactNative from 'react-native'
import {render} from '@testing-library/react-native'

import {Text} from '#/components/Typography'

const mockUITextView = jest.fn()

jest.mock('react-native-uitextview', () => {
  const {Text: RNText} = jest.requireActual<typeof ReactNative>('react-native')
  return {
    UITextView: (props: {children: React.ReactNode}) => {
      mockUITextView(props)
      return <RNText>{props.children}</RNText>
    },
  }
})

describe('Typography Text', () => {
  beforeEach(() => mockUITextView.mockClear())

  it('renders non-selectable text through UITextView so it can nest inside selectable text', () => {
    render(
      <Text selectable>
        hello <Text>#blacksky</Text>
      </Text>,
    )

    expect(mockUITextView).toHaveBeenCalledTimes(2)
    expect(mockUITextView).toHaveBeenLastCalledWith(
      expect.objectContaining({uiTextView: true, children: '#blacksky'}),
    )
  })
})
