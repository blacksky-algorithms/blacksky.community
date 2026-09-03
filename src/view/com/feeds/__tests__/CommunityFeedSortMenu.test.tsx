import {fireEvent, render} from '@testing-library/react-native'

jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (
      message: {message?: string; values?: Record<string, string>} | string,
    ) => {
      if (typeof message === 'string') return message
      return message.message?.replace(
        /{(\w+)}/g,
        (_, key: string) => message.values?.[key] ?? '',
      )
    },
  }),
  Trans: ({
    id,
    message,
    values,
  }: {
    id: string
    message?: string
    values?: Record<string, string>
  }) =>
    (message ?? id).replace(
      /{(\w+)}/g,
      (_, key: string) => values?.[key] ?? '',
    ),
}))
jest.mock('#/components/icons/Chevron', () => ({
  ChevronBottom_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Clock', () => ({
  Clock_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Flame', () => ({
  Flame_Stroke2_Corner1_Rounded: () => null,
}))
jest.mock('#/components/Button', () => {
  const React = require('react')
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({
      children,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID?: string
    }) => (
      <Pressable
        accessibilityHint=""
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    ButtonIcon: () => null,
  }
})
jest.mock('#/components/Menu', () => {
  const {Pressable, Text, View} = require('react-native')
  const passthrough = ({children}: {children: React.ReactNode}) => (
    <View>{children}</View>
  )
  return {
    Root: passthrough,
    Outer: passthrough,
    Group: passthrough,
    Trigger: ({
      children,
      label,
    }: {
      children: (args: {
        props: {accessibilityLabel: string; onPress: () => void}
      }) => React.ReactNode
      label: string
    }) => children({props: {accessibilityLabel: label, onPress: () => {}}}),
    Item: ({
      children,
      label,
      onPress,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
    }) => (
      <Pressable
        accessibilityHint=""
        accessibilityLabel={label}
        onPress={onPress}
        testID={label}>
        {children}
      </Pressable>
    ),
    ItemText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    ItemIcon: () => null,
    ItemRadio: ({selected}: {selected: boolean}) => (
      <Text testID="radio">{selected ? 'selected' : 'unselected'}</Text>
    ),
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

import {CommunityFeedSortMenu} from '../CommunityFeedSortMenu'

describe('CommunityFeedSortMenu', () => {
  it('shows the active sort on the trigger', () => {
    const {getByTestId} = render(
      <CommunityFeedSortMenu sort="hot" onChange={jest.fn()} />,
    )

    expect(getByTestId('communityFeedSortButton')).toHaveTextContent('Hot')
  })

  it('defaults the trigger label to Recent', () => {
    const {getByTestId} = render(
      <CommunityFeedSortMenu sort="recent" onChange={jest.fn()} />,
    )

    expect(getByTestId('communityFeedSortButton')).toHaveTextContent('Recent')
  })

  it('selects the other sort from the menu', () => {
    const onChange = jest.fn()
    const {getByTestId, getAllByTestId} = render(
      <CommunityFeedSortMenu sort="recent" onChange={onChange} />,
    )

    fireEvent.press(getByTestId('Hot'))

    expect(onChange).toHaveBeenCalledWith('hot')
    const radios = getAllByTestId('radio')
    expect(radios[0]).toHaveTextContent(/^selected$/)
    expect(radios[1]).toHaveTextContent(/^unselected$/)
  })
})
