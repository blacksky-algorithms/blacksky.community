import {type ReactNode} from 'react'
import {View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

export const INPUT_TEXT = [a.text_lg, {lineHeight: 22}]

export function FieldLabelText({children}: {children: ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, a.mb_xs, t.atoms.text_contrast_medium]}>
      {children}
    </Text>
  )
}

export function DateBox({iso, isInvalid}: {iso: string; isInvalid?: boolean}) {
  const t = useTheme()
  const {i18n} = useLingui()
  const date = new Date(iso)
  return (
    <View
      style={[
        a.border,
        t.atoms.bg_contrast_50,
        {
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 6,
          borderColor: isInvalid ? t.palette.negative_500 : 'transparent',
        },
      ]}>
      <Text style={[INPUT_TEXT, t.atoms.text]}>
        {`${i18n.date(date, {dateStyle: 'medium'})},\n${i18n.date(date, {
          timeStyle: 'short',
        })}`}
      </Text>
    </View>
  )
}
