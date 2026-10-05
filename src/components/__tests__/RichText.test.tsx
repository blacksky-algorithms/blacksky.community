import type * as ReactNative from 'react-native'
import {RichText as RichTextAPI} from '@atproto/api'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {render} from '@testing-library/react-native'

import {RichText} from '#/components/RichText'

const mockInlineLinkText = jest.fn()

jest.mock('#/components/Link', () => {
  const {Text} = jest.requireActual<typeof ReactNative>('react-native')
  return {
    createStaticClick: () => ({onPress: jest.fn()}),
    createStaticClickIfUnmodified: () => ({onPress: jest.fn()}),
    InlineLinkText: (props: {children: React.ReactNode}) => {
      mockInlineLinkText(props)
      return <Text>{props.children}</Text>
    },
  }
})

jest.mock('react-native-uitextview', () => ({
  UITextView: jest.requireActual<typeof ReactNative>('react-native').Text,
}))

jest.mock('#/components/Menu', () => {
  const Passthrough = ({children}: {children: React.ReactNode}) => children
  return {
    Root: Passthrough,
    Trigger: ({
      children,
    }: {
      children: (ctx: {props: {onPress: () => void}}) => React.ReactNode
    }) => children({props: {onPress: jest.fn()}}),
    Outer: () => null,
    Group: Passthrough,
    Item: Passthrough,
    ItemText: Passthrough,
    ItemIcon: () => null,
    Divider: () => null,
  }
})

jest.mock('#/components/ProfileHoverCard', () => ({
  ProfileHoverCard: ({children}: {children: React.ReactNode}) => children,
}))

jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: () => ({isLoading: false, data: undefined}),
  useUpsertMutedWordsMutation: () => ({
    mutateAsync: jest.fn(),
    variables: undefined,
    reset: jest.fn(),
  }),
  useRemoveMutedWordsMutation: () => ({
    mutateAsync: jest.fn(),
    variables: undefined,
    reset: jest.fn(),
  }),
}))

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({push: jest.fn()}),
}))

i18n.activate('en')

function richTextWithTag() {
  const text = 'hello #blacksky'
  return new RichTextAPI({
    text,
    facets: [
      {
        index: {byteStart: 6, byteEnd: 15},
        features: [{$type: 'app.bsky.richtext.facet#tag', tag: 'blacksky'}],
      },
    ],
  })
}

describe('RichText tags', () => {
  beforeEach(() => mockInlineLinkText.mockClear())

  it('forwards selectable to tag links so they nest inside selectable text on iOS', () => {
    render(
      <I18nProvider i18n={i18n}>
        <RichText value={richTextWithTag()} enableTags selectable />
      </I18nProvider>,
    )

    expect(mockInlineLinkText).toHaveBeenCalledWith(
      expect.objectContaining({selectable: true}),
    )
  })
})
