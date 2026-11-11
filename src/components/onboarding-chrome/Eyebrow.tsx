import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a} from '#/alf'
import {useChromeColors} from '#/components/onboarding-chrome/useChromeColors'
import {Text} from '#/components/Typography'

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
  const {accent} = useChromeColors()

  let text: string | undefined
  if (step != null && total != null) {
    text = _(msg`Step ${step} of ${total}`)
  } else if (label != null) {
    text = label
  }

  if (text == null) {
    return null
  }

  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      <View
        style={{
          width: SHIM_SIZE,
          height: SHIM_SIZE,
          backgroundColor: accent,
        }}
      />
      <Text
        style={[
          a.font_mono,
          {
            fontWeight: '300',
            fontSize: 14,
            letterSpacing: -0.5,
            textTransform: 'uppercase',
            color: accent,
          },
        ]}>
        {text}
      </Text>
    </View>
  )
}
