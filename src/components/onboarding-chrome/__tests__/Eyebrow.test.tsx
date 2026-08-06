import {type ReactElement} from 'react'
import {type StyleProp, StyleSheet, type TextStyle} from 'react-native'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {render} from '@testing-library/react-native'

import {Eyebrow} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

function textTransformOf(node: {props: unknown}) {
  const {style} = node.props as {style?: StyleProp<TextStyle>}
  return StyleSheet.flatten(style).textTransform
}

describe('Eyebrow', () => {
  it('renders "Step 2 of 7" uppercased via style when step and total are provided', () => {
    const {getByText} = renderWithI18n(<Eyebrow step={2} total={7} />)

    const node = getByText('Step 2 of 7')
    expect(node).toBeTruthy()
    expect(textTransformOf(node)).toBe('uppercase')
  })

  it('renders the label uppercased via style when no step is provided', () => {
    const {getByText} = renderWithI18n(<Eyebrow label="Community Moderation" />)

    const node = getByText('Community Moderation')
    expect(node).toBeTruthy()
    expect(textTransformOf(node)).toBe('uppercase')
  })

  it('renders null when given no props', () => {
    const {toJSON} = renderWithI18n(<Eyebrow />)

    expect(toJSON()).toBeNull()
  })
})
