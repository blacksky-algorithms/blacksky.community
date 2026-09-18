import {type ReactElement} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {PrimaryButton} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

describe('PrimaryButton', () => {
  it('renders its label', () => {
    const {getByText} = renderWithI18n(
      <PrimaryButton label="Continue" onPress={jest.fn()} />,
    )

    expect(getByText('Continue')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    const {getByText} = renderWithI18n(
      <PrimaryButton label="Continue" onPress={onPress} />,
    )

    fireEvent.press(getByText('Continue'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    const {getByText} = renderWithI18n(
      <PrimaryButton label="Continue" onPress={onPress} disabled />,
    )

    fireEvent.press(getByText('Continue'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
