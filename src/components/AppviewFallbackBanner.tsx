import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {useAppviewFallback} from '#/state/appview-fallback'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

export function AppviewFallbackBanner() {
  const t = useTheme()
  const active = useAppviewFallback()

  if (!active) return null

  return (
    <View
      style={[
        a.w_full,
        a.px_lg,
        a.py_xs,
        a.align_center,
        t.atoms.bg_contrast_25,
      ]}>
      <Text style={[a.text_xs, a.text_center, t.atoms.text_contrast_medium]}>
        <Trans>
          Compatibility mode — community features and some accounts may be
          delayed or unavailable.
        </Trans>
      </Text>
    </View>
  )
}
