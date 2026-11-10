import {type CSSProperties, useRef, useState} from 'react'
import {Pressable, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {
  type EventTimeField,
  fromLocalInputValue,
  toLocalInputValue,
} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'
import {DateBox, FieldLabelText} from './EventFields'

const FIELDS = ['startsAt', 'endsAt'] as const

const HIDDEN_INPUT: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: '100%',
  height: 0,
  opacity: 0,
  border: 0,
  padding: 0,
  pointerEvents: 'none',
}

export function EventDateRange({
  startsAt,
  endsAt,
  isEndInvalid,
  onChange,
}: EventDateRangeProps) {
  const t = useTheme()
  const {t: l} = useLingui()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [isPickerUnavailable, setIsPickerUnavailable] = useState(
    () => !('showPicker' in HTMLInputElement.prototype),
  )
  const values = {startsAt, endsAt}
  const labels = {startsAt: l`Start date`, endsAt: l`End date`}

  const renderInput = (
    key: EventTimeField,
    style: CSSProperties,
    hidden: boolean,
  ) => (
    <input
      ref={el => {
        inputs.current[key] = el
      }}
      type="datetime-local"
      data-testid={`${key}Input`}
      aria-label={labels[key]}
      tabIndex={hidden ? -1 : undefined}
      value={toLocalInputValue(values[key])}
      onChange={e => {
        const iso = fromLocalInputValue(e.target.value)
        if (iso) onChange(key, iso)
      }}
      style={style}
    />
  )

  return (
    <View style={[a.flex_row, a.gap_sm]}>
      {FIELDS.map(key => {
        const isInvalid = key === 'endsAt' && isEndInvalid
        return (
          <View key={key} style={[a.flex_1]}>
            <FieldLabelText>{labels[key]}</FieldLabelText>
            {isPickerUnavailable ? (
              renderInput(
                key,
                {
                  boxSizing: 'border-box',
                  width: '100%',
                  padding: '6px 16px',
                  borderRadius: 10,
                  border: `1px solid ${
                    isInvalid ? t.palette.negative_500 : 'transparent'
                  }`,
                  background: t.atoms.bg_contrast_50.backgroundColor,
                  color: t.atoms.text.color,
                  colorScheme: t.scheme,
                  font: 'inherit',
                  fontSize: a.text_lg.fontSize,
                },
                false,
              )
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels[key]}
                accessibilityHint={l`Opens the date and time picker`}
                onPress={() => {
                  try {
                    inputs.current[key]?.showPicker()
                  } catch {
                    setIsPickerUnavailable(true)
                  }
                }}>
                <DateBox iso={values[key]} isInvalid={isInvalid} />
                {renderInput(key, HIDDEN_INPUT, true)}
              </Pressable>
            )}
          </View>
        )
      })}
    </View>
  )
}
