import {View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import * as TextField from '#/components/forms/TextField'
import {
  fromLocalInputValue,
  toLocalInputValue,
} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'

export function EventDateRange({
  startsAt,
  endsAt,
  isEndInvalid,
  onChange,
}: EventDateRangeProps) {
  const t = useTheme()
  const {t: l} = useLingui()
  const values = {startsAt, endsAt}
  const labels = {startsAt: l`Start date`, endsAt: l`End date`}

  return (
    <View style={[a.flex_row, a.gap_sm]}>
      {(['startsAt', 'endsAt'] as const).map(key => (
        <View key={key} style={[a.flex_1]}>
          <TextField.LabelText>{labels[key]}</TextField.LabelText>
          <TextField.Root isInvalid={key === 'endsAt' && isEndInvalid}>
            <input
              type="datetime-local"
              data-testid={`${key}Input`}
              aria-label={labels[key]}
              value={toLocalInputValue(values[key])}
              onChange={e => {
                const iso = fromLocalInputValue(e.target.value)
                if (iso) onChange(key, iso)
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                font: 'inherit',
                fontSize: a.text_md.fontSize,
                color: t.atoms.text.color,
                colorScheme: t.scheme,
                background: 'transparent',
                border: 0,
              }}
            />
          </TextField.Root>
        </View>
      ))}
    </View>
  )
}
