import {Pressable, Text} from 'react-native'
import {type I18n} from '@lingui/core'
import {render, userEvent} from '@testing-library/react-native'

jest.mock('@lingui/react', () => {
  const {i18n} = jest.requireActual<{i18n: I18n}>('@lingui/core')
  i18n.loadAndActivate({locale: 'en', messages: {}})
  return {
    useLingui: () => ({
      _: (descriptor: {id: string; message?: string}): string =>
        i18n._(descriptor),
    }),
  }
})
jest.mock('#/alf', () => ({
  atoms: new Proxy({}, {get: () => ({})}),
  useTheme: () => ({
    atoms: {
      bg_contrast_25: {backgroundColor: '#F1F3F5'},
      bg_contrast_50: {backgroundColor: '#E2E7EC'},
      border_contrast_low: {borderColor: '#D4DBE2'},
      text_contrast_medium: {color: '#42576C'},
      text: {color: '#0B0F14'},
    },
  }),
}))
jest.mock('#/components/Typography', () => {
  const {Text: RNText} = require('react-native')
  return {Text: RNText}
})

import {VoteButtons} from '../VoteButtons'

function renderInLink(buttons: React.ReactElement) {
  const onLinkPress = jest.fn()
  const view = render(
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Open post"
      accessibilityHint=""
      onPress={onLinkPress}>
      <Text>Post text</Text>
      {buttons}
    </Pressable>,
  )
  return {...view, onLinkPress}
}

describe('VoteButtons', () => {
  it('keeps a tap on a disabled button from reaching the enclosing link', async () => {
    const onVote = jest.fn()
    const {getByTestId, getByText, onLinkPress} = renderInLink(
      <VoteButtons disabled onVote={onVote} />,
    )
    const user = userEvent.setup()

    await user.press(getByTestId('pollVote-agree'))
    await user.press(getByTestId('pollVote-disagree'))
    await user.press(getByTestId('pollVote-pass'))

    expect(onVote).not.toHaveBeenCalled()
    expect(onLinkPress).not.toHaveBeenCalled()

    await user.press(getByText('Post text'))

    expect(onLinkPress).toHaveBeenCalledTimes(1)
  })

  it('casts the vote from an enabled button without reaching the enclosing link', async () => {
    const onVote = jest.fn()
    const {getByTestId, onLinkPress} = renderInLink(
      <VoteButtons onVote={onVote} />,
    )
    const user = userEvent.setup()

    await user.press(getByTestId('pollVote-disagree'))

    expect(onVote).toHaveBeenCalledTimes(1)
    expect(onVote).toHaveBeenCalledWith('disagree')
    expect(onLinkPress).not.toHaveBeenCalled()
  })
})
