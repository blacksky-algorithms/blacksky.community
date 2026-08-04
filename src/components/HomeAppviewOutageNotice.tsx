import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {useHomeAppviewOutage} from '#/state/appview-health'
import {atoms as a, useTheme} from '#/alf'
import {CircleInfo_Stroke2_Corner0_Rounded as CircleInfo} from '#/components/icons/CircleInfo'
import {Text} from '#/components/Typography'

export function HomeAppviewOutageNotice() {
  const t = useTheme()
  const outage = useHomeAppviewOutage()

  if (!outage) return null

  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.px_lg,
        a.py_md,
        t.atoms.bg_contrast_25,
      ]}>
      <CircleInfo size="sm" style={t.atoms.text_contrast_medium} />
      <Text style={[a.text_sm, a.flex_1, t.atoms.text_contrast_medium]}>
        <Trans>
          Community features are temporarily unavailable. We're working on it —
          the rest of the app still works.
        </Trans>
      </Text>
    </View>
  )
}
