import {type ReactElement} from 'react'
import type * as ReactNative from 'react-native'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {render} from '@testing-library/react-native'

import {Eyebrow} from '#/components/onboarding-chrome'

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof ReactNative>('react-native')

  Object.defineProperty(actual.Platform, 'OS', {
    value: 'ios',
    configurable: true,
  })
  Object.defineProperty(actual.Platform, 'Version', {
    value: '17.0',
    configurable: true,
  })

  return actual
})

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

describe('Eyebrow', () => {
  it('renders "STEP 2 OF 7" when step and total are provided', () => {
    const {getByText} = renderWithI18n(<Eyebrow step={2} total={7} />)

    expect(getByText('STEP 2 OF 7')).toBeTruthy()
  })

  it('renders the uppercased label when no step is provided', () => {
    const {getByText} = renderWithI18n(<Eyebrow label="Community Moderation" />)

    expect(getByText('COMMUNITY MODERATION')).toBeTruthy()
  })
})
