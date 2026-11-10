import {useState} from 'react'
import {Keyboard, Pressable, View} from 'react-native'
import {DateTimePicker} from '@expo/ui/community/datetime-picker'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Text} from '#/components/Typography'
import {type EventTimeField} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'
import {DateBox, FieldLabelText} from './EventFields'
import {IS_ANDROID} from '#/env'

const FIELDS = ['startsAt', 'endsAt'] as const

function withDate(current: Date, picked: Date): Date {
  const next = new Date(current)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

function withTime(current: Date, picked: Date): Date {
  const next = new Date(current)
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
  return next
}

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
  const selected = new Date(values[field])
  const labels = {startsAt: l`Start date`, endsAt: l`End date`}
  const short = (iso: string) =>
    i18n.date(new Date(iso), {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

  const open = (next: EventTimeField) => {
    Keyboard.dismiss()
    setField(next)
    control.open()
  }

  return (
    <>
      <View style={[a.flex_row, a.gap_sm]}>
        {FIELDS.map(key => (
          <View key={key} style={[a.flex_1]}>
            <FieldLabelText>{labels[key]}</FieldLabelText>
            <Pressable
              testID={`${key}Btn`}
              accessibilityRole="button"
              accessibilityLabel={labels[key]}
              accessibilityHint={l`Opens the date and time picker`}
              onPress={() => open(key)}>
              <DateBox
                iso={values[key]}
                isInvalid={key === 'endsAt' && isEndInvalid}
              />
            </Pressable>
          </View>
        ))}
      </View>
      <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
        <Dialog.Handle />
        <Dialog.ScrollableInner label={l`Event dates`}>
          <View style={[a.gap_lg]}>
            <View
              accessibilityRole="tablist"
              style={[a.flex_row, a.border_b, t.atoms.border_contrast_low]}>
              {FIELDS.map(key => {
                const active = field === key
                return (
                  <Pressable
                    key={key}
                    testID={`${key}Tab`}
                    accessibilityRole="tab"
                    accessibilityState={{selected: active}}
                    accessibilityLabel={labels[key]}
                    accessibilityHint=""
                    onPress={() => setField(key)}
                    style={[a.flex_1, a.align_center, a.pt_md]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.pb_sm,
                        t.atoms.text,
                        active && a.font_semi_bold,
                      ]}>
                      {key === 'startsAt' ? (
                        <Trans>Start: {short(startsAt)}</Trans>
                      ) : (
                        <Trans>End: {short(endsAt)}</Trans>
                      )}
                    </Text>
                    <View
                      style={[
                        a.w_full,
                        {
                          height: 3,
                          borderTopLeftRadius: 2,
                          borderTopRightRadius: 2,
                          backgroundColor: active
                            ? t.palette.primary_500
                            : 'transparent',
                        },
                      ]}
                    />
                  </Pressable>
                )
              })}
            </View>
            <View style={[a.w_full, a.align_center]}>
              {IS_ANDROID ? (
                <>
                  <DateTimePicker
                    key={`${field}-date`}
                    style={a.w_full}
                    mode="date"
                    presentation="inline"
                    themeVariant={t.scheme}
                    value={selected}
                    onValueChange={(_event, date) =>
                      onChange(field, withDate(selected, date).toISOString())
                    }
                    testID={`${field}DatePicker`}
                  />
                  <DateTimePicker
                    key={`${field}-time`}
                    style={a.w_full}
                    mode="time"
                    presentation="inline"
                    themeVariant={t.scheme}
                    value={selected}
                    onValueChange={(_event, date) =>
                      onChange(field, withTime(selected, date).toISOString())
                    }
                    testID={`${field}TimePicker`}
                  />
                </>
              ) : (
                <DateTimePicker
                  key={field}
                  style={a.w_full}
                  mode="datetime"
                  display="spinner"
                  themeVariant={t.scheme}
                  locale={i18n.locale.replace(/-/g, '_')}
                  value={selected}
                  onValueChange={(_event, date) =>
                    onChange(field, date.toISOString())
                  }
                  testID={`${field}Picker`}
                />
              )}
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
