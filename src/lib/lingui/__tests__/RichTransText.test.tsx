import type * as ReactNative from 'react-native'
import {Text as RNText, View} from 'react-native'
import {setupI18n} from '@lingui/core'
import {msg, ph, plural} from '@lingui/core/macro'
import {I18nProvider, Trans} from '@lingui/react'
import {render} from '@testing-library/react-native'

import {RichTransText} from '#/lib/lingui/RichTransText'

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

function renderWithI18n(children: React.ReactNode) {
  const i18n = setupI18n()
  i18n.load('en', {})
  i18n.activate('en')

  return render(<I18nProvider i18n={i18n}>{children}</I18nProvider>)
}

function hasRawTextOutsideText(node: unknown, inText = false): boolean {
  if (typeof node === 'string') {
    return !inText && node.trim().length > 0
  }
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) {
    return node.some(child => hasRawTextOutsideText(child, inText))
  }

  const tree = node as {
    type?: string
    props?: {testID?: string}
    children?: unknown
  }
  const nextInText =
    inText || tree.type === 'Text' || tree.props?.testID === 'ui-text-view'

  return hasRawTextOutsideText(tree.children, nextInText)
}

describe('RichTransText', () => {
  it('recreates the unsafe Trans shape under a View', () => {
    const firstAuthorLink = <RNText testID="author-link">Alice</RNText>

    const {toJSON} = renderWithI18n(
      <View>
        {/* eslint-disable-next-line bsky-internal/avoid-unwrapped-text */}
        <Trans
          id="unsafe-like"
          message="{firstAuthorLink} liked your post"
          values={{firstAuthorLink}}
        />
      </View>,
    )

    expect(hasRawTextOutsideText(toJSON())).toBe(true)
  })

  it('wraps scalar text while preserving a React value placeholder', () => {
    const firstAuthorLink = <RNText testID="author-link">Alice</RNText>

    const {getByTestId, toJSON} = renderWithI18n(
      <View>
        <RichTransText
          message={msg`${ph({firstAuthorLink: ''})} liked your post`}
          values={{firstAuthorLink}}
        />
      </View>,
    )

    expect(getByTestId('author-link')).toBeTruthy()
    expect(hasRawTextOutsideText(toJSON())).toBe(false)
  })

  it('preserves translated count wrappers and reordered placeholders', () => {
    const firstAuthorLink = <RNText testID="author-link">Alice</RNText>
    const count = 2
    const message = msg`<0>${plural(count, {
      one: '# other',
      other: '# others',
    })}</0> liked your post, including ${ph({firstAuthorLink: ''})}`

    const {getByTestId, toJSON} = renderWithI18n(
      <View>
        <RichTransText
          message={message}
          values={{firstAuthorLink}}
          components={{
            0: <RNText testID="count" />,
          }}
        />
      </View>,
    )

    expect(getByTestId('author-link')).toBeTruthy()
    expect(getByTestId('count')).toHaveTextContent('2 others')
    expect(hasRawTextOutsideText(toJSON())).toBe(false)
  })

  it('handles nested placeholders without raw text escaping', () => {
    const {getByTestId, toJSON} = renderWithI18n(
      <View>
        <RichTransText
          message={{
            id: 'nested',
            message: 'Replied to <0><1/></0>',
          }}
          components={{
            0: <RNText testID="hover-card" />,
            1: <RNText testID="user-info">Alice</RNText>,
          }}
        />
      </View>,
    )

    expect(getByTestId('hover-card')).toBeTruthy()
    expect(getByTestId('user-info')).toBeTruthy()
    expect(hasRawTextOutsideText(toJSON())).toBe(false)
  })

  it('supports object-form messages with contextual rich placeholders', () => {
    const author = <RNText testID="author-link">Alice</RNText>

    const {getByTestId, toJSON} = renderWithI18n(
      <View>
        <RichTransText
          message={msg({
            message: `Replied to ${ph({author: ''})}`,
            context: 'description',
          })}
          values={{author}}
        />
      </View>,
    )

    expect(getByTestId('author-link')).toBeTruthy()
    expect(hasRawTextOutsideText(toJSON())).toBe(false)
  })
})
