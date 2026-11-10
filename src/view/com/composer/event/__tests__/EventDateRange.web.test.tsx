import {fireEvent, render} from '@testing-library/react-native'

jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (message: {message?: string} | string) =>
      typeof message === 'string' ? message : (message.message ?? ''),
  }),
}))
jest.mock('#/alf', () => {
  const blank = new Proxy({}, {get: () => ({})})
  return {
    atoms: blank,
    useTheme: () => ({
      atoms: blank,
      palette: new Proxy({}, {get: (target, key) => String(key)}),
      scheme: 'dark',
    }),
  }
})
jest.mock('../EventFields', () => ({
  DateBox: () => null,
  FieldLabelText: () => null,
}))

import {EventDateRange} from '../EventDateRange.web'

const props = {
  startsAt: '2027-01-15T11:05:00.000Z',
  endsAt: '2027-01-15T12:05:00.000Z',
  isEndInvalid: false,
  onChange: jest.fn(),
}

function withInputPrototype(prototype: object) {
  ;(globalThis as unknown as {HTMLInputElement: unknown}).HTMLInputElement = {
    prototype,
  }
}

describe('EventDateRange on web', () => {
  afterEach(() => {
    delete (globalThis as unknown as {HTMLInputElement?: unknown})
      .HTMLInputElement
  })

  it('opens the browser picker from the styled boxes when it can', () => {
    withInputPrototype({showPicker() {}})
    const {getAllByRole} = render(<EventDateRange {...props} />)
    expect(getAllByRole('button')).toHaveLength(2)
  })

  it('shows the date inputs directly when the browser has no picker API', () => {
    withInputPrototype({})
    const {queryAllByRole, UNSAFE_getAllByType} = render(
      <EventDateRange {...props} />,
    )
    expect(queryAllByRole('button')).toHaveLength(0)
    const [start] = UNSAFE_getAllByType('input' as never) as unknown as {
      props: {tabIndex?: number}
    }[]
    expect(start.props.tabIndex).toBeUndefined()
  })

  it('falls back to the date inputs when opening the picker fails', () => {
    withInputPrototype({showPicker() {}})
    const {getAllByRole, queryAllByRole} = render(
      <EventDateRange {...props} />,
      {
        createNodeMock: () => ({
          showPicker() {
            throw new Error('not supported')
          },
        }),
      },
    )
    fireEvent.press(getAllByRole('button')[0])
    expect(queryAllByRole('button')).toHaveLength(0)
  })
})
