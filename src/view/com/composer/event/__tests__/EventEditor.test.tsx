import {useReducer} from 'react'
import {fireEvent, render} from '@testing-library/react-native'

import {
  composerReducer,
  type ComposerState,
  createComposerState,
} from '#/view/com/composer/state/composer'

jest.mock('@lingui/react', () => {
  const format = (
    message:
      | {message?: string; values?: Record<string, string | number>}
      | string,
  ) => {
    if (typeof message === 'string') return message
    return (message.message ?? '').replace(/{(\w+)}/g, (_, key: string) =>
      String(message.values?.[key] ?? ''),
    )
  }
  return {
    useLingui: () => ({_: format, i18n: {locale: 'en-US'}}),
    Trans: ({
      id,
      message,
      values,
    }: {
      id: string
      message?: string
      values?: Record<string, string | number>
    }) => format({message: message ?? id, values}),
  }
})
jest.mock('#/alf', () => {
  const blank = new Proxy({}, {get: () => ({})})
  return {
    atoms: blank,
    useTheme: () => ({
      atoms: blank,
      palette: new Proxy({}, {get: (target, key) => String(key)}),
    }),
  }
})
jest.mock('#/alf/themes', () => ({DEFAULT_BRAND: {secondary: '#D2FC51'}}))
jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})
jest.mock('#/components/icons/CalendarDays', () => ({
  CalendarDays_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/Button', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({
      children,
      disabled,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      disabled?: boolean
      label: string
      onPress: () => void
      testID?: string
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint=""
        disabled={disabled}
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
jest.mock('#/components/forms/TextField', () => {
  const {Text, TextInput} = require('react-native')
  return {
    Root: ({children}: {children: React.ReactNode}) => children,
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Input: ({
      label,
      onChangeText,
      testID,
      value,
    }: {
      label: string
      onChangeText: (text: string) => void
      testID: string
      value: string
    }) => (
      <TextInput
        accessibilityLabel={label}
        accessibilityHint=""
        onChangeText={onChangeText}
        testID={testID}
        value={value}
      />
    ),
  }
})

const mockMetric = jest.fn()
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: mockMetric}),
}))
jest.mock('#/lib/api/community-feed', () => ({
  isSpaceBackedFeed: (config: {space?: string} | undefined) => !!config?.space,
}))
jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('#/view/com/composer/state/video', () => ({
  createVideoState: jest.fn(),
  videoReducer: jest.fn(),
}))

jest.mock('../EventDateRange', () => {
  const {Pressable} = require('react-native')
  return {
    EventDateRange: ({
      onChange,
    }: {
      onChange: (field: string, iso: string) => void
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="End before start"
        accessibilityHint=""
        testID="setEndBeforeStart"
        onPress={() => onChange('endsAt', '2000-01-01T00:00:00.000Z')}
      />
    ),
  }
})

const mockLinkImage = jest.fn()
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({enabled}: {enabled: boolean}) => ({
    data: enabled ? mockLinkImage() : undefined,
  }),
}))
jest.mock('#/state/session', () => ({
  useAgent: () => ({}),
  useSession: () => ({
    currentAccount: {did: 'did:plc:me', handle: 'me.test'},
  }),
}))
jest.mock('#/components/Menu', () => {
  const {Pressable, Text, View} = require('react-native')
  return {
    Root: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    Outer: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    Group: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    Trigger: ({
      children,
    }: {
      children: (p: {props: {accessibilityLabel: string}}) => React.ReactNode
    }) => children({props: {accessibilityLabel: 'Event options'}}),
    Item: ({
      children,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID: string
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ItemText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    ItemIcon: () => null,
  }
})
jest.mock('#/features/events/components/EventEmbed', () => {
  const {Text} = require('react-native')
  return {
    EventEmbedCard: ({
      event,
      parsed,
    }: {
      event: {thumb?: string}
      parsed: {name: string; location?: string}
    }) => (
      <Text testID="previewCard">
        {[parsed.name, parsed.location ?? '', event.thumb ?? ''].join('|')}
      </Text>
    ),
  }
})
jest.mock('#/lib/link-meta/link-meta', () => ({getLinkMeta: jest.fn()}))
jest.mock('../EventCoverPicker', () => {
  const {Pressable, Text, View} = require('react-native')
  return {
    EventCoverPicker: ({
      cover: banner,
      onChange: onSelectNewBanner,
    }: {
      cover?: string
      onChange: (image: unknown) => void
    }) => (
      <View>
        <Text testID="coverShown">{banner ?? 'none'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick"
          accessibilityHint=""
          testID="pickCover"
          onPress={() =>
            onSelectNewBanner({
              path: 'file:///picked.jpg',
              mime: 'image/jpeg',
              width: 1500,
              height: 500,
              size: 1,
            })
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove"
          accessibilityHint=""
          testID="removeCover"
          onPress={() => onSelectNewBanner(null)}
        />
      </View>
    ),
  }
})

import {EventEditor} from '../EventEditor'

function composerWithEvent(): ComposerState {
  const state = createComposerState({
    initText: undefined,
    initMention: undefined,
    initImageUris: undefined,
    initQuoteUri: undefined,
    initInteractionSettings: undefined,
  })
  return composerReducer(state, {
    type: 'update_post',
    postId: state.thread.posts[0].id,
    postAction: {type: 'embed_add_event'},
  })
}

function Harness() {
  const [state, dispatch] = useReducer(
    composerReducer,
    undefined,
    composerWithEvent,
  )
  const post = state.thread.posts[0]
  if (!post.embed.event) return null
  const {Text} = require('react-native')
  return (
    <>
      <EventEditor
        event={post.embed.event}
        dispatch={postAction =>
          dispatch({type: 'update_post', postId: post.id, postAction})
        }
      />
      <Text testID="draftCover">
        {JSON.stringify(post.embed.event.cover ?? null)}
      </Text>
    </>
  )
}

describe('EventEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('needs a name before continuing', () => {
    const {getByTestId} = render(<Harness />)
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 1 of 3')

    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 1 of 3')

    fireEvent.changeText(getByTestId('eventNameInput'), 'Party')
    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 2 of 3')
  })

  it('has no back button on the first step', () => {
    const {queryByTestId} = render(<Harness />)
    expect(queryByTestId('eventBackBtn')).toBeNull()
  })

  it('walks through the steps, back and forth, to the finished event', () => {
    const {getByTestId, queryByTestId, getByText} = render(<Harness />)
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party')
    fireEvent.press(getByTestId('eventContinueBtn'))
    fireEvent.changeText(getByTestId('eventLocationInput'), 'The park')
    fireEvent.press(getByTestId('eventBackBtn'))
    expect(getByTestId('eventNameInput')).toHaveProp('value', 'Party')

    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('eventLocationInput')).toHaveProp('value', 'The park')
    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 3 of 3')
    expect(getByTestId('eventContinueBtn')).toHaveProp(
      'accessibilityLabel',
      'Create event',
    )

    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(queryByTestId('eventStepLabel')).toBeNull()
    expect(queryByTestId('removeEventBtn')).toBeNull()
    expect(getByText(/^Party\|/)).toBeTruthy()

    fireEvent.press(getByTestId('editEventBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 1 of 3')
  })

  it('previews the finished event from the record that will be saved', () => {
    mockLinkImage.mockReturnValue('https://example.com/og.jpg')
    const {getByTestId} = toCoverStep('https://twitch.tv/someone')
    fireEvent.press(getByTestId('eventContinueBtn'))

    expect(getByTestId('previewCard')).toHaveTextContent(
      'Party||https://example.com/og.jpg',
    )
  })

  it('deletes the finished event from its menu', () => {
    const {getByTestId, queryByTestId} = toCoverStep('Prospect Park')
    fireEvent.press(getByTestId('eventContinueBtn'))
    fireEvent.press(getByTestId('deleteEventBtn'))
    expect(queryByTestId('eventEditor')).toBeNull()
    expect(mockMetric).toHaveBeenCalledWith('composer:event:remove', {})
  })

  it('removes the event', () => {
    const {getByTestId, queryByTestId} = render(<Harness />)
    fireEvent.press(getByTestId('removeEventBtn'))
    expect(queryByTestId('eventEditor')).toBeNull()
    expect(mockMetric).toHaveBeenCalledWith('composer:event:remove', {})
  })

  it('blocks continuing when the end is before the start', () => {
    const {getByTestId, getByText} = render(<Harness />)
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party')
    fireEvent.press(getByTestId('eventContinueBtn'))
    fireEvent.press(getByTestId('setEndBeforeStart'))

    expect(getByText('The end date must be after the start date.')).toBeTruthy()
    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 2 of 3')
  })

  function toCoverStep(location: string) {
    const utils = render(<Harness />)
    fireEvent.changeText(utils.getByTestId('eventNameInput'), 'Party')
    fireEvent.press(utils.getByTestId('eventContinueBtn'))
    fireEvent.changeText(utils.getByTestId('eventLocationInput'), location)
    fireEvent.press(utils.getByTestId('eventContinueBtn'))
    return utils
  }

  it("defaults the cover to the link's image and keeps it on create", () => {
    mockLinkImage.mockReturnValue('https://example.com/og.jpg')
    const {getByTestId} = toCoverStep('https://twitch.tv/someone')

    expect(getByTestId('coverShown')).toHaveTextContent(
      'https://example.com/og.jpg',
    )
    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('draftCover')).toHaveTextContent(
      JSON.stringify({url: 'https://example.com/og.jpg'}),
    )
  })

  it('lets a picked photo replace the default, and removal clear it', () => {
    mockLinkImage.mockReturnValue('https://example.com/og.jpg')
    const {getByTestId} = toCoverStep('https://twitch.tv/someone')

    fireEvent.press(getByTestId('pickCover'))
    expect(getByTestId('coverShown')).toHaveTextContent('file:///picked.jpg')

    fireEvent.press(getByTestId('removeCover'))
    expect(getByTestId('coverShown')).toHaveTextContent('none')
    fireEvent.press(getByTestId('eventContinueBtn'))
    expect(getByTestId('draftCover')).toHaveTextContent('null')
  })

  it('looks up no link image for an in-person place', () => {
    const {getByTestId} = toCoverStep('Prospect Park')
    expect(mockLinkImage).not.toHaveBeenCalled()
    expect(getByTestId('coverShown')).toHaveTextContent('none')
  })

  it('offers Save changes and no Remove when editing a published event', () => {
    const {getByTestId, queryByTestId} = render(
      <EventEditor
        event={{
          step: 'cover',
          name: 'Party',
          description: '',
          location: '',
          startsAt: '2027-01-15T00:00:00.000Z',
          endsAt: '2027-01-15T00:00:00.000Z',
        }}
        dispatch={jest.fn()}
        isEditing
      />,
    )
    expect(queryByTestId('removeEventBtn')).toBeNull()
    expect(getByTestId('eventContinueBtn')).toHaveProp(
      'accessibilityLabel',
      'Save changes',
    )
  })
})
