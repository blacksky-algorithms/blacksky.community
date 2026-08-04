import {Text, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {colors} from '#/lib/styles'
import {atoms as a, tokens} from '#/alf'

const SHIM_SIZE = 13

export function Eyebrow({
  step,
  total,
  label,
}: {
  step?: number
  total?: number
  label?: string
}) {
  const {_} = useLingui()

  let text: string | undefined
  if (step != null && total != null) {
    text = _(msg`Step ${step} of ${total}`).toUpperCase()
  } else if (label != null) {
    text = label.toUpperCase()
  }

  if (text == null) {
    return null
  }

  return (
    <View style={[a.flex_row, a.align_center, {gap: tokens.space.sm}]}>
      <View
        style={{
          width: SHIM_SIZE,
          height: SHIM_SIZE,
          backgroundColor: colors.green2,
        }}
      />
      <Text
        style={{
          fontFamily: 'AzeretMonoVariable',
          fontWeight: '300',
          fontSize: 14,
          letterSpacing: -0.5,
          textTransform: 'uppercase',
          color: colors.green2,
        }}>
        {text}
      </Text>
    </View>
  )
}
