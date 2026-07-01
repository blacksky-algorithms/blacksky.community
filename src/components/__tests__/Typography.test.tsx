import type * as ReactNative from 'react-native'
import {Text as RNText} from 'react-native'
import {setupI18n} from '@lingui/core'
import {I18nProvider, Trans} from '@lingui/react'
import {render} from '@testing-library/react-native'

import {Text} from '#/components/Typography'

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

jest.mock('react-native-uitextview', () => {
  const React = require('react')
  const {Text: RNText} = require('react-native')

  return {
    UITextView: jest.fn(({children, ...props}) => (
      <RNText testID="ui-text-view" {...props}>
        {children}
      </RNText>
    )),
  }
})

describe('Text', () => {
  it('renders non-selectable text without UITextView', () => {
    const {getByText, queryByTestId} = render(<Text>Normal text</Text>)

    expect(getByText('Normal text')).toBeTruthy()
    expect(queryByTestId('ui-text-view')).toBeNull()
  })

  it('uses UITextView for selectable iOS text', () => {
    const {getByTestId} = render(<Text selectable>Selectable text</Text>)

    expect(getByTestId('ui-text-view')).toBeTruthy()
  })

  it('does not nest UITextView inside selectable emoji text', () => {
    const {getAllByTestId, getByText} = render(
      <Text selectable emoji>
        😀 popular post
      </Text>,
    )

    expect(getByText('😀 popular post')).toBeTruthy()
    expect(getAllByTestId('ui-text-view')).toHaveLength(1)
  })

  it('still allows native Text children inside non-selectable text', () => {
    const {getByText, queryByTestId} = render(
      <Text>
        <RNText>Nested text</RNText>
      </Text>,
    )

    expect(getByText('Nested text')).toBeTruthy()
    expect(queryByTestId('ui-text-view')).toBeNull()
  })

  it('resolves direct Lingui Trans children before rendering native Text', () => {
    const i18n = setupI18n()
    i18n.load('en', {
      handlePreview: 'Your full handle will be <0>{handle}</0>.',
    })
    i18n.activate('en')

    const {getByText, UNSAFE_queryByType} = render(
      <I18nProvider i18n={i18n}>
        <Text>
          <Trans
            id="handlePreview"
            message="Your full handle will be <0>{handle}</0>."
            values={{handle: '@alice.test'}}
            components={{
              0: <RNText testID="handle" />,
            }}
          />
        </Text>
      </I18nProvider>,
    )

    expect(getByText('@alice.test')).toBeTruthy()
    expect(UNSAFE_queryByType(Trans)).toBeNull()
  })
})
