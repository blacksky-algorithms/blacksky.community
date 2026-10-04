import {fireEvent, render} from '@testing-library/react-native'

import {Nux} from '#/state/queries/nuxs/definitions'

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
    useLingui: () => ({_: format}),
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
      palette: new Proxy({}, {get: () => '#000'}),
    }),
  }
})
jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})
jest.mock('#/components/icons/Poll', () => ({
  Poll_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/Button', () => {
  const {Pressable} = require('react-native')
  return {
    Button: ({
      accessibilityHint,
      children,
      disabled,
      label,
      onPress,
      testID,
    }: {
      accessibilityHint: string
      children: React.ReactNode
      disabled?: boolean
      label: string
      onPress: () => void
      testID?: string
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{disabled: !!disabled}}
        disabled={disabled}
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
  }
})

const mockMetric = jest.fn()
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: mockMetric}),
}))

type NuxState =
  | {
      status: 'ready'
      nux:
        | {id: Nux.ComposerPoll; completed: boolean; data: undefined}
        | undefined
    }
  | {status: 'loading' | 'error'; nux: undefined}

const UNSEEN: NuxState = {status: 'ready', nux: undefined}
const SEEN: NuxState = {
  status: 'ready',
  nux: {id: Nux.ComposerPoll, completed: true, data: undefined},
}

let mockNux: NuxState
const mockSaveNux = jest.fn()
jest.mock('#/state/queries/nuxs', () => ({
  Nux: {ComposerPoll: 'ComposerPoll'},
  useNux: () => mockNux,
  useSaveNux: () => ({mutate: mockSaveNux}),
}))

import {SelectPollBtn} from '../SelectPollBtn'

describe('SelectPollBtn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNux = SEEN
  })

  it('opens the poll editor and reports it', () => {
    const onPress = jest.fn()
    const {getByTestId} = render(<SelectPollBtn onPress={onPress} />)

    const button = getByTestId('openPollBtn')
    expect(button).toHaveProp('accessibilityLabel', 'Add poll')
    expect(button).toHaveProp(
      'accessibilityHint',
      'Attaches a poll to this post',
    )
    fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledWith('composer:poll:open', {})
    expect(mockSaveNux).not.toHaveBeenCalled()
  })

  it('shows the New badge until the first press saves the NUX', () => {
    mockNux = UNSEEN
    const onPress = jest.fn()
    const {getByTestId, getByText, queryByText, rerender} = render(
      <SelectPollBtn onPress={onPress} />,
    )
    expect(getByText('New')).toBeTruthy()

    fireEvent.press(getByTestId('openPollBtn'))

    expect(mockSaveNux).toHaveBeenCalledTimes(1)
    expect(mockSaveNux).toHaveBeenCalledWith({
      id: Nux.ComposerPoll,
      data: undefined,
      completed: true,
    })
    expect(onPress).toHaveBeenCalledTimes(1)

    mockNux = SEEN
    rerender(<SelectPollBtn onPress={onPress} />)

    expect(queryByText('New')).toBeNull()
  })

  it('shows the New badge for a saved but incomplete NUX', () => {
    mockNux = {
      status: 'ready',
      nux: {id: Nux.ComposerPoll, completed: false, data: undefined},
    }
    const {getByText} = render(<SelectPollBtn onPress={jest.fn()} />)
    expect(getByText('New')).toBeTruthy()
  })

  it.each([{status: 'loading' as const}, {status: 'error' as const}])(
    'shows no badge and saves nothing while the NUX is $status',
    ({status}) => {
      mockNux = {status, nux: undefined}
      const onPress = jest.fn()
      const {getByTestId, queryByText} = render(
        <SelectPollBtn onPress={onPress} />,
      )
      expect(queryByText('New')).toBeNull()

      fireEvent.press(getByTestId('openPollBtn'))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(mockSaveNux).not.toHaveBeenCalled()
    },
  )

  it('blocks the press and hides the badge while disabled', () => {
    mockNux = UNSEEN
    const onPress = jest.fn()
    const {getByTestId, queryByText} = render(
      <SelectPollBtn onPress={onPress} disabled />,
    )

    const button = getByTestId('openPollBtn')
    expect(button).toHaveProp('accessibilityState', {disabled: true})
    expect(queryByText('New')).toBeNull()
    fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
    expect(mockMetric).not.toHaveBeenCalled()
    expect(mockSaveNux).not.toHaveBeenCalled()
  })

  it('is enabled by default', () => {
    const {getByTestId} = render(<SelectPollBtn onPress={jest.fn()} />)
    expect(getByTestId('openPollBtn')).toHaveProp('accessibilityState', {
      disabled: false,
    })
  })
})
