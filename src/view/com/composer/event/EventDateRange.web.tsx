import {useRef} from 'react'
import {Pressable, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a} from '#/alf'
import {
  fromLocalInputValue,
  toLocalInputValue,
} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'
import {DateBox, FieldLabelText} from './EventFields'

const FIELDS = ['startsAt', 'endsAt'] as const

export function EventDateRange({
  startsAt,
  endsAt,
  isEndInvalid,
  onChange,
}: EventDateRangeProps) {
  const {t: l} = useLingui()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const values = {startsAt, endsAt}
  const labels = {startsAt: l`Start date`, endsAt: l`End date`}

  return (
    <View style={[a.flex_row, a.gap_sm]}>
      {FIELDS.map(key => (
        <View key={key} style={[a.flex_1]}>
          <FieldLabelText>{labels[key]}</FieldLabelText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels[key]}
            accessibilityHint={l`Opens the date and time picker`}
            onPress={() => {
              const input = inputs.current[key]
              try {
                input?.showPicker()
              } catch {
                input?.focus()
              }
            }}>
            <DateBox
              iso={values[key]}
              isInvalid={key === 'endsAt' && isEndInvalid}
            />
            <input
              ref={el => {
                inputs.current[key] = el
              }}
              type="datetime-local"
              data-testid={`${key}Input`}
              aria-label={labels[key]}
              tabIndex={-1}
              value={toLocalInputValue(values[key])}
              onChange={e => {
                const iso = fromLocalInputValue(e.target.value)
                if (iso) onChange(key, iso)
              }}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: '100%',
                height: 0,
                opacity: 0,
                border: 0,
                padding: 0,
                pointerEvents: 'none',
              }}
            />
          </Pressable>
        </View>
      ))}
    </View>
  )
}
