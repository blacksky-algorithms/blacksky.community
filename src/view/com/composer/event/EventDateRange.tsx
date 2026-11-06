import {useState} from 'react'
import {Keyboard, Pressable, View} from 'react-native'
import DatePicker from 'react-native-date-picker'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Text} from '#/components/Typography'
import {type EventTimeField} from '#/features/events/draft'
import {type EventDateRangeProps} from './EventDateRange.types'
import {DateBox, FieldLabelText} from './EventFields'

const FIELDS = ['startsAt', 'endsAt'] as const

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
              style={[a.flex_row, a.border_b, {borderBottomColor: '#e3e4e5'}]}>
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
