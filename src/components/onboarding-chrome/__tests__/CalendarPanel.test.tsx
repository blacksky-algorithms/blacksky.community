import {type ReactElement} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {
  CalendarPanel,
  monthGrid,
} from '#/components/onboarding-chrome/CalendarPanel'

/*
 * The month and year menus are the app's shared select control, which has its
 * own tests and needs a dialog host to mount.
 */
jest.mock('#/components/Select', () => ({
  Root: () => null,
  Trigger: () => null,
  ValueText: () => null,
  Icon: () => null,
  Content: () => null,
  Item: () => null,
  ItemText: () => null,
  ItemIndicator: () => null,
}))

i18n.activate('en')

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

describe('monthGrid', () => {
  it('pads a month that starts midweek to whole weeks', () => {
    // November 2006 starts on a Wednesday and has 30 days
    const cells = monthGrid({year: 2006, month: 10})
    expect(cells).toHaveLength(35)
    expect(cells.slice(0, 4)).toEqual([null, null, null, 1])
    expect(cells[32]).toBe(30)
    expect(cells.slice(33)).toEqual([null, null])
  })

  it('uses four weeks for a 28-day month that starts on Sunday', () => {
    const cells = monthGrid({year: 2015, month: 1})
    expect(cells).toHaveLength(28)
    expect(cells[0]).toBe(1)
    expect(cells[27]).toBe(28)
  })

  it('counts the leap day', () => {
    expect(monthGrid({year: 2024, month: 1})).toContain(29)
    expect(monthGrid({year: 2023, month: 1})).not.toContain(29)
  })
})

describe('CalendarPanel', () => {
  it('reports the picked day as a calendar date', () => {
    const onChange = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <CalendarPanel
        value="2006-11-11"
        maximumDate="2026-11-11"
        onChange={onChange}
      />,
    )

    fireEvent.press(getByLabelText('November 7, 2006'))

    expect(onChange).toHaveBeenCalledWith('2006-11-07')
  })

  it('moves a month at a time across a year boundary', () => {
    const onChange = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <CalendarPanel
        value="2006-01-15"
        maximumDate="2026-11-11"
        onChange={onChange}
      />,
    )

    fireEvent.press(getByLabelText('Previous month'))
    fireEvent.press(getByLabelText('December 25, 2005'))

    expect(onChange).toHaveBeenCalledWith('2005-12-25')
  })

  it('does not offer a day after the maximum date', () => {
    const onChange = jest.fn()
    const {getByLabelText} = renderWithI18n(
      <CalendarPanel
        value="2026-11-05"
        maximumDate="2026-11-11"
        onChange={onChange}
      />,
    )

    fireEvent.press(getByLabelText('November 12, 2026'))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.press(getByLabelText('November 11, 2026'))
    expect(onChange).toHaveBeenCalledWith('2026-11-11')
  })
})
