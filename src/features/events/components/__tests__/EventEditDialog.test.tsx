import {act, fireEvent, render} from '@testing-library/react-native'

jest.mock('@lingui/react', () => {
  const format = (
    message:
      {message?: string; values?: Record<string, string | number>} | string,
  ) => {
    if (typeof message === 'string') return message
    return (message.message ?? '').replace(/{(\w+)}/g, (_, key: string) =>
      String(message.values?.[key] ?? ''),
    )
  }
  return {
    useLingui: () => ({_: format, i18n: {locale: 'en-US'}}),
    Trans: ({id, message}: {id: string; message?: string}) =>
      format({message: message ?? id}),
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
jest.mock('#/components/icons/Camera', () => ({
  Camera_Filled_Stroke2_Corner0_Rounded: () => null,
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
        accessibilityState={{disabled}}
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

const mockClose = jest.fn()
jest.mock('#/components/Dialog', () => {
  const {Text, View} = require('react-native')
  return {
    Outer: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    useDialogContext: () => ({close: mockClose}),
    ScrollableInner: ({
      header,
      children,
    }: {
      header: React.ReactNode
      children: React.ReactNode
    }) => (
      <View>
        {header}
        {children}
      </View>
    ),
    Header: ({
      renderLeft,
      renderRight,
      children,
    }: {
      renderLeft: () => React.ReactNode
      renderRight: () => React.ReactNode
      children: React.ReactNode
    }) => (
      <View>
        {renderLeft()}
        {children}
        {renderRight()}
      </View>
    ),
    HeaderText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

const mockToast = jest.fn()
jest.mock('#/components/Toast', () => ({
  show: (...args: unknown[]) => mockToast(...args),
}))
jest.mock('#/logger', () => ({logger: {error: jest.fn()}}))
jest.mock('expo-localization', () => ({getLocales: () => [{regionCode: 'US'}]}))
jest.mock('#/state/session', () => ({usePdsClient: () => ({})}))
jest.mock('#/lib/api', () => ({uploadEventCover: jest.fn()}))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({setQueryData: jest.fn()}),
}))

const mockWrite = jest.fn()
jest.mock('../../queries', () => ({
  EVENT_RQKEY: (uri: string) => ['event', uri],
  EventGoneError: class extends Error {},
  useEventWriteMutation: () => ({mutateAsync: mockWrite}),
}))
jest.mock('#/view/com/composer/event/EventCoverPicker', () => ({
  EventCoverPicker: ({children}: {children: React.ReactNode}) => children,
}))
jest.mock('#/view/com/composer/event/EventDateRange', () => ({
  EventDateRange: () => null,
}))
jest.mock('#/screens/Event/EventHeader', () => ({Poster: () => null}))

import {type ParsedEvent} from '../../record'
import {type EventView} from '../../types'
import {EventEditDialog} from '../EventEditDialog'

const event = {
  uri: 'at://did:plc:host/community.lexicon.calendar.event/3kevent',
  creator: {did: 'did:plc:host', handle: 'host.test'},
  record: {},
} as unknown as EventView
const parsed: ParsedEvent = {
  name: 'Party',
  description: 'Bring snacks',
  location: 'Portland',
  startsAt: new Date('2027-01-15T21:00:00.000Z'),
  endsAt: new Date('2027-01-15T23:00:00.000Z'),
  cancelled: false,
  links: [],
}

const renderDialog = () =>
  render(
    <EventEditDialog control={{} as never} event={event} parsed={parsed} />,
  )

const isDisabled = (el: {props: {accessibilityState?: {disabled?: boolean}}}) =>
  !!el.props.accessibilityState?.disabled

describe('EventEditDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('keeps Save disabled until something changes', () => {
    const {getByTestId} = renderDialog()
    expect(isDisabled(getByTestId('eventEditSaveBtn'))).toBe(true)
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party 2')
    expect(isDisabled(getByTestId('eventEditSaveBtn'))).toBe(false)
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party')
    expect(isDisabled(getByTestId('eventEditSaveBtn'))).toBe(true)
  })

  it('keeps Save disabled while the title is empty', () => {
    const {getByTestId} = renderDialog()
    fireEvent.changeText(getByTestId('eventNameInput'), '  ')
    expect(isDisabled(getByTestId('eventEditSaveBtn'))).toBe(true)
  })

  it('writes only the changed field and closes on save', async () => {
    mockWrite.mockResolvedValue(undefined)
    const {getByTestId} = renderDialog()
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party 2')
    await act(async () => {
      fireEvent.press(getByTestId('eventEditSaveBtn'))
      await Promise.resolve()
    })
    expect(mockWrite).toHaveBeenCalledTimes(1)
    const updater = (mockWrite.mock.calls as unknown[][])[0][0] as (
      current: Record<string, unknown>,
    ) => Record<string, unknown>
    expect(updater({name: 'Party', description: 'Bring snacks'})).toEqual({
      name: 'Party 2',
      description: 'Bring snacks',
    })
    expect(mockClose).toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Event updated')
  })

  it('saves once when Save is pressed twice', async () => {
    let resolve = () => {}
    mockWrite.mockReturnValue(new Promise<void>(r => (resolve = r)))
    const {getByTestId} = renderDialog()
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party 2')
    fireEvent.press(getByTestId('eventEditSaveBtn'))
    fireEvent.press(getByTestId('eventEditSaveBtn'))
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
    expect(mockWrite).toHaveBeenCalledTimes(1)
  })

  it('closes without saving on Cancel', () => {
    const {getByTestId} = renderDialog()
    fireEvent.changeText(getByTestId('eventNameInput'), 'Party 2')
    fireEvent.press(getByTestId('eventEditCancelBtn'))
    expect(mockClose).toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })
})
