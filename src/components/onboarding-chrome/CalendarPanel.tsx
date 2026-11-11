import {useMemo, useState} from 'react'
import {Pressable, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a, web} from '#/alf'
import {
  ChevronLeft_Stroke2_Corner0_Rounded as ChevronLeft,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRight,
} from '#/components/icons/Chevron'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {useChromeColors} from '#/components/onboarding-chrome/useChromeColors'
import * as Select from '#/components/Select'
import {Text} from '#/components/Typography'

const DAY_SIZE = 36
const CONTROL_SIZE = 32
const OLDEST_AGE = 120

type YearMonth = {year: number; month: number}

function parse(date: string): YearMonth & {day: number} {
  const [year, month, day] = date.split('-').map(Number)
  return {year, month: month - 1, day}
}

function format(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

/**
 * The day cells of a month in whole weeks starting on Sunday, with `null` for
 * the cells outside the month.
 */
export function monthGrid({year, month}: YearMonth): (number | null)[] {
  const lead = utc(year, month, 1).getUTCDay()
  const days = utc(year, month + 1, 0).getUTCDate()
  const weeks = Math.ceil((lead + days) / 7)
  return Array.from({length: weeks * 7}, (_, i) => {
    const day = i - lead + 1
    return day >= 1 && day <= days ? day : null
  })
}

/**
 * A month calendar in the signup form's field style. Dates are calendar days
 * in `YYYY-MM-DD` form, with no time zone attached.
 */
export function CalendarPanel({
  value,
  maximumDate,
  onChange,
  testID,
}: {
  value: string
  maximumDate: string
  onChange: (date: string) => void
  testID?: string
}) {
  const c = useChromeColors()
  const {i18n, t: l} = useLingui()
  const selected = parse(value)
  const max = parse(maximumDate)
  const [view, setView] = useState<YearMonth>({
    year: selected.year,
    month: selected.month,
  })

  const {monthNames, weekdayNames, weekdayInitials} = useMemo(() => {
    const month = new Intl.DateTimeFormat(i18n.locale, {
      month: 'long',
      timeZone: 'UTC',
    })
    const weekday = (width: 'long' | 'narrow') =>
      new Intl.DateTimeFormat(i18n.locale, {weekday: width, timeZone: 'UTC'})
    // 2023-01-01 was a Sunday
    const week = Array.from({length: 7}, (_, i) => utc(2023, 0, 1 + i))
    return {
      monthNames: Array.from({length: 12}, (_, i) =>
        month.format(utc(2023, i, 1)),
      ),
      weekdayNames: week.map(d => weekday('long').format(d)),
      weekdayInitials: week.map(d => weekday('narrow').format(d)),
    }
  }, [i18n.locale])

  const isAfterMax = (year: number, month: number, day = 1) =>
    format(year, month, day) > maximumDate
  const atLastMonth = view.year === max.year && view.month === max.month
  const atFirstMonth = view.year === max.year - OLDEST_AGE && view.month === 0

  const step = (delta: number) => {
    const next = utc(view.year, view.month + delta, 1)
    setView({year: next.getUTCFullYear(), month: next.getUTCMonth()})
  }

  const selectMonth = (month: number) => {
    setView({
      year: view.year,
      month: isAfterMax(view.year, month) ? max.month : month,
    })
  }

  const selectYear = (year: number) => {
    setView({
      year,
      month: isAfterMax(year, view.month) ? max.month : view.month,
    })
  }

  const years = Array.from({length: OLDEST_AGE + 1}, (_, i) => max.year - i)
  const cells = monthGrid(view)

  return (
    <View
      testID={testID}
      style={[
        a.w_full,
        a.mt_sm,
        a.p_md,
        a.gap_sm,
        {
          backgroundColor: c.fieldBg,
          borderColor: c.fieldBorder,
          borderWidth: 1,
          borderRadius: 8,
        },
      ]}>
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <ArrowButton
          label={l`Previous month`}
          icon={ChevronLeft}
          disabled={atFirstMonth}
          onPress={() => step(-1)}
        />

        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Dropdown
            label={l`Month`}
            value={String(view.month)}
            onValueChange={month => selectMonth(Number(month))}
            items={monthNames.map((name, i) => ({
              label: name,
              value: String(i),
            }))}
          />
          <Dropdown
            label={l`Year`}
            value={String(view.year)}
            onValueChange={year => selectYear(Number(year))}
            items={years.map(year => ({
              label: String(year),
              value: String(year),
            }))}
          />
        </View>

        <ArrowButton
          label={l`Next month`}
          icon={ChevronRight}
          disabled={atLastMonth}
          onPress={() => step(1)}
        />
      </View>

      <View style={[a.flex_row, a.flex_wrap]}>
        {weekdayInitials.map((initial, i) => (
          <View
            key={weekdayNames[i]}
            style={[a.align_center, a.pb_xs, {width: `${100 / 7}%`}]}>
            <Text
              accessibilityLabel={weekdayNames[i]}
              accessibilityHint=""
              style={[
                a.font_mono,
                {
                  fontSize: 12,
                  color: c.placeholder,
                  textTransform: 'uppercase',
                },
              ]}>
              {initial}
            </Text>
          </View>
        ))}

        {cells.map((day, i) => {
          if (day === null) {
            return (
              <View
                key={`blank-${i}`}
                style={{width: `${100 / 7}%`, height: DAY_SIZE}}
              />
            )
          }
          const date = format(view.year, view.month, day)
          const isSelected = date === value
          const isToday = date === maximumDate
          const disabled = date > maximumDate
          return (
            <View
              key={date}
              style={[
                a.align_center,
                {width: `${100 / 7}%`, height: DAY_SIZE},
              ]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.date(utc(view.year, view.month, day), {
                  dateStyle: 'long',
                  timeZone: 'UTC',
                })}
                accessibilityHint=""
                accessibilityState={{selected: isSelected, disabled}}
                disabled={disabled}
                onPress={() => onChange(date)}
                style={state => [
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  web(a.pointer),
                  {width: DAY_SIZE, height: DAY_SIZE, borderWidth: 1},
                  {
                    borderColor:
                      isToday && !isSelected ? c.fieldBorder : 'transparent',
                    backgroundColor: isSelected
                      ? c.accent
                      : (state as {hovered?: boolean}).hovered && !disabled
                        ? c.fieldBorder
                        : 'transparent',
                    opacity: disabled ? 0.3 : 1,
                  },
                ]}>
                <Text
                  style={[
                    {
                      fontSize: 14,
                      color: isSelected ? c.onAccent : c.inputText,
                    },
                    isSelected && a.font_bold,
                  ]}>
                  {day}
                </Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function controlStyle(c: ReturnType<typeof useChromeColors>, active: boolean) {
  return {
    height: CONTROL_SIZE,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: c.fieldBorder,
    backgroundColor: active ? c.fieldBorder : 'transparent',
  }
}

function ArrowButton({
  label,
  icon: Icon,
  disabled,
  onPress,
}: {
  label: string
  icon: React.ComponentType<SVGIconProps>
  disabled: boolean
  onPress: () => void
}) {
  const c = useChromeColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={state => [
        a.align_center,
        a.justify_center,
        web(a.pointer),
        controlStyle(
          c,
          !disabled && Boolean((state as {hovered?: boolean}).hovered),
        ),
        {width: CONTROL_SIZE, opacity: disabled ? 0.3 : 1},
      ]}>
      <Icon width={16} style={{color: c.inputText}} />
    </Pressable>
  )
}

function Dropdown({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  items: {label: string; value: string}[]
}) {
  const c = useChromeColors()
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger label={label}>
        {({props, state}) => (
          <Pressable
            {...props}
            accessibilityRole="button"
            accessibilityHint=""
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.px_sm,
              web(a.pointer),
              controlStyle(c, state.hovered || state.focused),
            ]}>
            {/* The default value text takes the menu item's own colour. */}
            <Select.ValueText
              webOverrideValue={items.find(item => item.value === value)}
              style={[a.font_semi_bold, {color: c.inputText}]}>
              {(item: {label: string}) => item.label}
            </Select.ValueText>
            <Select.Icon style={{color: c.placeholder}} />
          </Pressable>
        )}
      </Select.Trigger>
      <Select.Content
        label={label}
        renderItem={item => (
          <Select.Item
            value={item.value}
            label={item.label}
            style={web([a.pointer])}>
            <Select.ItemIndicator />
            <Select.ItemText>{item.label}</Select.ItemText>
          </Select.Item>
        )}
        items={items}
      />
    </Select.Root>
  )
}
