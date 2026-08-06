import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {Warning_Stroke2_Corner0_Rounded as Warning} from '#/components/icons/Warning'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepBelong() {
  const {_} = useLingui()
  const t = useTheme()
  const {dispatch} = useOnboardingInternalState()

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow label={_(msg`Community moderation`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Belong, safely</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Feel protected by the first social app to moderate for fatphobia,
            ableism, misogynoir, and anti-Black harassment.
          </Trans>
        </Text>
      </View>

      <View style={[a.gap_md, a.py_sm]}>
        <FlaggedPostCard label={_(msg`Misogynoir`)} rotate="-3deg" />
        <FlaggedPostCard label={_(msg`Synthetic Media`)} rotate="2deg" />
        <FlaggedPostCard label={_(msg`Anti-Black Harassment`)} rotate="-2deg" />
      </View>

      <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
        <Trans>
          Moderation and labels have been shaped by democratic, human community
          member input.
        </Trans>
      </Text>

      <PrimaryButton
        label={_(msg`Continue`)}
        onPress={() => dispatch({type: 'next'})}
      />
    </View>
  )
}

function FlaggedPostCard({label, rotate}: {label: string; rotate: string}) {
  const t = useTheme()

  return (
    <View
      style={[
        a.flex_row,
        a.gap_sm,
        a.p_md,
        a.rounded_md,
        a.border,
        t.atoms.bg_contrast_25,
        t.atoms.border_contrast_low,
        {transform: [{rotate}]},
      ]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          t.atoms.bg_contrast_100,
          {width: 40, height: 40, borderRadius: 20},
        ]}>
        <Logomark width={20} fill={t.atoms.text_contrast_medium.color} />
      </View>

      <View style={[a.flex_1, a.gap_sm]}>
        <View style={[a.flex_row, a.gap_xs, a.align_center]}>
          <SkeletonBar width={72} tone="strong" />
          <View style={[a.flex_1]}>
            <SkeletonBar tone="weak" />
          </View>
        </View>

        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.px_sm,
            a.py_xs,
            a.rounded_sm,
            t.atoms.bg_contrast_50,
          ]}>
          <Warning size="xs" fill={t.atoms.text_contrast_medium.color} />
          <Text
            style={[a.flex_1, a.text_xs, a.leading_tight, t.atoms.text]}
            numberOfLines={1}>
            {label}
          </Text>
        </View>

        <SkeletonBar tone="weak" />
      </View>
    </View>
  )
}

function SkeletonBar({
  width,
  tone = 'weak',
}: {
  width?: number
  tone?: 'weak' | 'strong'
}) {
  const t = useTheme()

  return (
    <View
      style={[
        tone === 'strong' ? t.atoms.bg_contrast_300 : t.atoms.bg_contrast_100,
        {height: 10, borderRadius: 8, width: width ?? '100%'},
      ]}
    />
  )
}
