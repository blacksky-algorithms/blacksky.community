import {createRef, type ReactElement} from 'react'
import {type TextInput} from 'react-native'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {InputGroup} from '#/components/onboarding-chrome'

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

function propsOf(node: {props: unknown}) {
  return node.props as {
    secureTextEntry?: boolean
    'aria-invalid'?: boolean
    accessibilityHint?: string
    style?: Record<string, unknown>
  }
}

const NEAR_WHITE = /#F8FAF9/i
const DIVIDER_COLOR = '#464985'

function collectColors(style: unknown, out: string[]) {
  if (Array.isArray(style)) {
    for (const s of style) collectColors(s, out)
  } else if (style && typeof style === 'object') {
    const color = (style as {color?: unknown}).color
    if (typeof color === 'string') out.push(color)
  }
}

function flattenStyle(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (Array.isArray(style)) {
    for (const s of style) Object.assign(out, flattenStyle(s))
  } else if (style && typeof style === 'object') {
    Object.assign(out, style as Record<string, unknown>)
  }
  return out
}

type JsonNode = {
  type?: string
  props?: {style?: unknown}
  children?: JsonNode[] | null
}

function hasDivider(node: JsonNode | null): boolean {
  if (!node || typeof node !== 'object') return false
  const style = flattenStyle(node.props?.style)
  if (style.height === 1 && style.backgroundColor === DIVIDER_COLOR) {
    return true
  }
  return (node.children ?? []).some(child => hasDivider(child))
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

  it('renders the label with a theme token, not a hardcoded near-white', () => {
    const {getByText} = renderWithI18n(
      <InputGroup label="Email" value="" onChangeText={jest.fn()} />,
    )

    const colorsSeen: string[] = []
    collectColors(propsOf(getByText('Email')).style, colorsSeen)
    for (const c of colorsSeen) {
      expect(c).not.toMatch(NEAR_WHITE)
    }
  })

  it('marks the input invalid and links the error via a11y hint when errorText is set', () => {
    const {getByLabelText} = renderWithI18n(
      <InputGroup
        label="Email"
        value=""
        onChangeText={jest.fn()}
        errorText="Enter a valid email"
      />,
    )

    const input = getByLabelText('Email')
    expect(propsOf(input)['aria-invalid']).toBe(true)
    expect(propsOf(input).accessibilityHint).toBe('Enter a valid email')
  })

  it('does not uppercase the typed value by default', () => {
    const {getByLabelText} = renderWithI18n(
      <InputGroup
        label="Email"
        value="hi@example.com"
        onChangeText={jest.fn()}
      />,
    )

    const style = propsOf(getByLabelText('Email')).style as {
      textTransform?: string
    }
    expect(style.textTransform).toBeUndefined()
  })

  it('uppercases the typed value only when uppercaseValue is set', () => {
    const {getByLabelText} = renderWithI18n(
      <InputGroup
        label="Handle"
        value="alice"
        onChangeText={jest.fn()}
        uppercaseValue
      />,
    )

    const style = propsOf(getByLabelText('Handle')).style as {
      textTransform?: string
    }
    expect(style.textTransform).toBe('uppercase')
  })

  it('calls onPress when the field is not editable', () => {
    const onPress = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <InputGroup
        label="Date of birth"
        value=""
        onChangeText={jest.fn()}
        editable={false}
        onPress={onPress}
      />,
    )

    fireEvent.press(getByLabelText('Date of birth'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not render a divider by default', () => {
    const {toJSON} = renderWithI18n(
      <InputGroup label="Email" value="" onChangeText={jest.fn()} />,
    )

    expect(hasDivider(toJSON() as JsonNode)).toBe(false)
  })

  it('renders a divider when showDivider is set', () => {
    const {toJSON} = renderWithI18n(
      <InputGroup
        label="Email"
        value=""
        onChangeText={jest.fn()}
        showDivider
      />,
    )

    expect(hasDivider(toJSON() as JsonNode)).toBe(true)
  })

  it('forwards a ref to the underlying TextInput', () => {
    const ref = createRef<TextInput>()
    renderWithI18n(
      <InputGroup label="Email" value="" onChangeText={jest.fn()} ref={ref} />,
    )

    expect(ref.current).toBeTruthy()
  })
})
