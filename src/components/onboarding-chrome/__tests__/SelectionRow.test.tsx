import {type ReactElement} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {SelectionRow} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

function a11yOf(node: {props: unknown}) {
  return node.props as {
    accessibilityRole?: string
    accessibilityState?: {selected?: boolean}
  }
}

describe('SelectionRow', () => {
  it('calls onPress when the row is pressed', () => {
    const onPress = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <SelectionRow
        mode="radio"
        selected={false}
        onPress={onPress}
        title="blacksky.app"
      />,
    )

    fireEvent.press(getByLabelText('blacksky.app'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reflects selected in accessibilityState', () => {
    const {getByLabelText} = renderWithI18n(
      <SelectionRow
        mode="radio"
        selected
        onPress={jest.fn()}
        title="blacksky.app"
      />,
    )

    expect(
      a11yOf(getByLabelText('blacksky.app')).accessibilityState?.selected,
    ).toBe(true)
  })

  it('renders a radio row with the radio role', () => {
    const {getByLabelText} = renderWithI18n(
      <SelectionRow
        mode="radio"
        selected={false}
        onPress={jest.fn()}
        title="blacksky.app"
      />,
    )

    expect(a11yOf(getByLabelText('blacksky.app')).accessibilityRole).toBe(
      'radio',
    )
  })

  it('renders a checkbox row with the checkbox role', () => {
    const {getByLabelText} = renderWithI18n(
      <SelectionRow
        mode="checkbox"
        selected={false}
        onPress={jest.fn()}
        title="Discover"
      />,
    )

    expect(a11yOf(getByLabelText('Discover')).accessibilityRole).toBe(
      'checkbox',
    )
  })
})
