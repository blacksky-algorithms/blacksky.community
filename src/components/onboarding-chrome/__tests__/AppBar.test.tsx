import {type ReactElement} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {AppBar} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

describe('AppBar', () => {
  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn()
    const {getByLabelText} = renderWithI18n(<AppBar onBack={onBack} />)

    fireEvent.press(getByLabelText('Go back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls onHelp when the help button is pressed', () => {
    const onHelp = jest.fn()
    const {getByLabelText} = renderWithI18n(<AppBar onHelp={onHelp} />)

    fireEvent.press(getByLabelText('Get help'))
    expect(onHelp).toHaveBeenCalledTimes(1)
  })

  it('renders no back button when showBack is false', () => {
    const onBack = jest.fn()
    const {queryByLabelText} = renderWithI18n(
      <AppBar onBack={onBack} showBack={false} />,
    )

    expect(queryByLabelText('Go back')).toBeNull()
  })

  it('renders no back button when onBack is undefined', () => {
    const {queryByLabelText} = renderWithI18n(<AppBar />)

    expect(queryByLabelText('Go back')).toBeNull()
  })

  it('renders no help button when onHelp is undefined', () => {
    const {queryByLabelText} = renderWithI18n(<AppBar onBack={jest.fn()} />)

    expect(queryByLabelText('Get help')).toBeNull()
  })
})
