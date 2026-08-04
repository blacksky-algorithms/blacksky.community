import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeft} from '#/components/icons/Arrow'
import {CircleQuestion_Stroke2_Corner2_Rounded as CircleQuestion} from '#/components/icons/CircleQuestion'

const BUTTON_SIZE = 48
const ICON_SIZE = 24

export function AppBar({
  onBack,
  onHelp,
  showBack = true,
}: {
  onBack?: () => void
  onHelp?: () => void
  showBack?: boolean
}) {
  const {_} = useLingui()
  const t = useTheme()

  const canGoBack = showBack && onBack != null

  return (
    <View style={[a.flex_row, a.justify_between, a.align_center, {padding: 4}]}>
      {canGoBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Go back`)}
          accessibilityHint=""
          onPress={onBack}
          style={[
            a.align_center,
            a.justify_center,
            {width: BUTTON_SIZE, height: BUTTON_SIZE},
          ]}>
          <ArrowLeft width={ICON_SIZE} fill={t.atoms.text.color} />
        </Pressable>
      ) : (
        <View style={{width: BUTTON_SIZE, height: BUTTON_SIZE}} />
      )}

      {onHelp != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Get help`)}
          accessibilityHint=""
          onPress={onHelp}
          style={[
            a.align_center,
            a.justify_center,
            {width: BUTTON_SIZE, height: BUTTON_SIZE},
          ]}>
          <CircleQuestion width={ICON_SIZE} fill={t.atoms.text.color} />
        </Pressable>
      ) : (
        <View style={{width: BUTTON_SIZE, height: BUTTON_SIZE}} />
      )}
    </View>
  )
}
