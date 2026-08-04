import {type ReactElement} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {InputGroup} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

function propsOf(node: {props: unknown}) {
  return node.props as {secureTextEntry?: boolean}
}

describe('InputGroup', () => {
  it('calls onChangeText when the user types', () => {
    const onChangeText = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <InputGroup label="Email" value="" onChangeText={onChangeText} />,
    )

    fireEvent.changeText(getByLabelText('Email'), 'hi@example.com')
    expect(onChangeText).toHaveBeenCalledWith('hi@example.com')
  })

  it('renders supportingText when there is no error', () => {
    const {queryByText} = renderWithI18n(
      <InputGroup
        label="Email"
        value=""
        onChangeText={jest.fn()}
        supportingText="We never share this"
      />,
    )

    expect(queryByText('We never share this')).toBeTruthy()
  })

  it('renders errorText and hides supportingText when invalid', () => {
    const {queryByText} = renderWithI18n(
      <InputGroup
        label="Email"
        value=""
        onChangeText={jest.fn()}
        supportingText="We never share this"
        errorText="Enter a valid email"
      />,
    )

    expect(queryByText('Enter a valid email')).toBeTruthy()
    expect(queryByText('We never share this')).toBeNull()
  })

  it('passes secureTextEntry to the underlying input', () => {
    const {getByLabelText} = renderWithI18n(
      <InputGroup
        label="Password"
        value=""
        onChangeText={jest.fn()}
        secureTextEntry
      />,
    )

    expect(propsOf(getByLabelText('Password')).secureTextEntry).toBe(true)
  })
})
