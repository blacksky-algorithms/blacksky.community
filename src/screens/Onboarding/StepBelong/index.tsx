import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepBelong() {
  const {_} = useLingui()
  const t = useTheme()
  const {dispatch} = useOnboardingInternalState()

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow step={6} total={7} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>You belong here</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Blacksky is a community built for you.</Trans>
        </Text>
      </View>

      <PrimaryButton
        label={_(msg`Continue`)}
        onPress={() => dispatch({type: 'next'})}
      />
    </View>
  )
}
