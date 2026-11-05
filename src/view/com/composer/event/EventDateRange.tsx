import {useState} from 'react'
import {Keyboard, Pressable, View} from 'react-native'
import DatePicker from 'react-native-date-picker'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {
  type EventTimeField,
  formatEventDraftDate,
} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'

export function EventDateRange({
  startsAt,
  endsAt,
  isEndInvalid,
  onChange,
}: EventDateRangeProps) {
  const t = useTheme()
  const {t: l, i18n} = useLingui()
  const control = Dialog.useDialogControl()
  const [field, setField] = useState<EventTimeField>('startsAt')
  const values = {startsAt, endsAt}
  const labels = {startsAt: l`Start date`, endsAt: l`End date`}

  const open = (next: EventTimeField) => {
    Keyboard.dismiss()
    setField(next)
    control.open()
  }

  return (
    <>
      <View style={[a.flex_row, a.gap_sm]}>
        {(['startsAt', 'endsAt'] as const).map(key => (
          <View key={key} style={[a.flex_1]}>
            <TextField.LabelText>{labels[key]}</TextField.LabelText>
            <Pressable
              testID={`${key}Btn`}
              accessibilityRole="button"
              accessibilityLabel={labels[key]}
              accessibilityHint={l`Opens the date and time picker`}
              onPress={() => open(key)}
              style={[
                a.px_md,
                a.py_sm,
                a.rounded_sm,
                a.border,
                t.atoms.bg_contrast_50,
                key === 'endsAt' && isEndInvalid
                  ? {borderColor: t.palette.negative_500}
                  : {borderColor: 'transparent'},
              ]}>
              <Text style={[a.text_md]}>
                {formatEventDraftDate(values[key], i18n.locale)}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
        <Dialog.Handle />
        <Dialog.ScrollableInner label={l`Event dates`}>
          <View style={[a.gap_lg]}>
            <View style={[a.flex_row, a.gap_sm]}>
              {(['startsAt', 'endsAt'] as const).map(key => (
                <Button
                  key={key}
                  testID={`${key}Tab`}
                  label={labels[key]}
                  size="small"
                  variant={field === key ? 'solid' : 'ghost'}
                  color="secondary"
                  style={[a.flex_1]}
                  onPress={() => setField(key)}>
                  <ButtonText>
                    {key === 'startsAt' ? (
                      <Trans>
                        Start: {formatEventDraftDate(startsAt, i18n.locale)}
                      </Trans>
                    ) : (
                      <Trans>
                        End: {formatEventDraftDate(endsAt, i18n.locale)}
                      </Trans>
                    )}
                  </ButtonText>
                </Button>
              ))}
            </View>
            <View style={[a.w_full, a.align_center]}>
              <DatePicker
                key={field}
                mode="datetime"
                theme={t.scheme}
                locale={i18n.locale}
                date={new Date(values[field])}
                onDateChange={date => onChange(field, date.toISOString())}
                aria-label={labels[field]}
                accessibilityLabel={labels[field]}
                accessibilityHint={l`Choose the date and time`}
              />
            </View>
            <Button
              label={l`Done`}
              onPress={() => control.close()}
              size="large"
              color="primary"
              variant="solid">
              <ButtonText>
                <Trans>Done</Trans>
              </ButtonText>
            </Button>
          </View>
        </Dialog.ScrollableInner>
      </Dialog.Outer>
    </>
  )
}
