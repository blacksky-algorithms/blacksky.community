import {View, type ViewStyle} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepAssembly() {
  const {_} = useLingui()
  const t = useTheme()
  const {dispatch} = useOnboardingInternalState()

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow label={_(msg`People's Assembly`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Have a say</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Vote on platform decisions, make proposals, and offer feedback
            through our People's Assembly.
          </Trans>
        </Text>
      </View>

      <View style={[a.py_sm]}>
        <StatementCard />
      </View>

      <PrimaryButton
        label={_(msg`Continue`)}
        onPress={() => dispatch({type: 'next'})}
      />
    </View>
  )
}

function StatementCard() {
  const {_} = useLingui()
  const t = useTheme()

  return (
    <View
      style={[
        a.gap_md,
        a.p_md,
        a.rounded_md,
        a.border,
        t.atoms.bg_contrast_25,
        t.atoms.border_contrast_low,
      ]}>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <Logomark width={18} fill={t.atoms.text_contrast_medium.color} />
        <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
          <Trans>People's Assembly</Trans>
        </Text>
      </View>

      <View
        style={[
          a.gap_sm,
          a.p_md,
          a.rounded_sm,
          a.border,
          t.atoms.bg_contrast_50,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <View
            style={[
              t.atoms.bg_contrast_200,
              {width: 24, height: 24, borderRadius: 12},
            ]}
          />
          <SkeletonBar width={120} tone="weak" />
        </View>
        <SkeletonBar tone="strong" />
        <SkeletonBar tone="strong" />
        <SkeletonBar width={140} tone="weak" />
      </View>

      <View style={[a.flex_row, a.gap_xs]}>
        <VotePill
          label={_(msg`Agree`)}
          borderStyle={{borderColor: t.palette.positive_500}}
        />
        <VotePill
          label={_(msg`Disagree`)}
          borderStyle={{borderColor: t.palette.negative_500}}
        />
        <VotePill
          label={_(msg`Pass/Unsure`)}
          borderStyle={t.atoms.border_contrast_medium}
        />
      </View>
    </View>
  )
}

function VotePill({
  label,
  borderStyle,
}: {
  label: string
  borderStyle: ViewStyle
}) {
  const t = useTheme()

  return (
    <View
      style={[
        a.flex_1,
        a.align_center,
        a.justify_center,
        a.px_sm,
        a.py_xs,
        a.rounded_full,
        a.border,
        borderStyle,
      ]}>
      <Text
        style={[a.text_xs, a.leading_tight, t.atoms.text]}
        numberOfLines={1}>
        {label}
      </Text>
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
        {height: 8, borderRadius: 8, width: width ?? '100%'},
      ]}
    />
  )
}
