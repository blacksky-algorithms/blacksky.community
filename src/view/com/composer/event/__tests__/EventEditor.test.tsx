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
  return (
    <EventEditor
      event={post.embed.event}
      dispatch={postAction =>
        dispatch({type: 'update_post', postId: post.id, postAction})
      }
    />
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
    expect(getByText('Party')).toBeTruthy()

    fireEvent.press(getByTestId('editEventBtn'))
    expect(getByTestId('eventStepLabel')).toHaveTextContent('Step 1 of 3')
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
})
