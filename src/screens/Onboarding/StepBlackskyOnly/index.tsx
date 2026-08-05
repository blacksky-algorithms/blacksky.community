import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepBlackskyOnly() {
  const {_} = useLingui()
  const t = useTheme()
  const {dispatch} = useOnboardingInternalState()

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow label={_(msg`Blacksky-only posts`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Keep it in the community</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Share posts that only other members of the Blacksky community can
            see.
          </Trans>
        </Text>
      </View>

      <View style={[a.py_sm]}>
        <SkeletonPostCard />
      </View>

      <PrimaryButton
        label={_(msg`Continue`)}
        onPress={() => dispatch({type: 'next'})}
      />
    </View>
  )
}

function SkeletonPostCard() {
  const {_} = useLingui()
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

        <View style={[a.gap_xs, a.py_xs]}>
          <SkeletonBar tone="weak" />
          <SkeletonBar tone="weak" />
          <SkeletonBar width={160} tone="weak" />
        </View>

        <View style={[a.flex_row, a.align_center, a.justify_end, a.pt_xs]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.px_sm,
              a.py_2xs,
              a.rounded_full,
              t.atoms.bg_contrast_50,
            ]}>
            <Logomark width={12} fill={t.atoms.text_contrast_medium.color} />
            <Text
              style={[a.text_xs, a.leading_tight, t.atoms.text_contrast_high]}>
              {_(msg`Blacksky-Only`)}
            </Text>
          </View>
        </View>
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
