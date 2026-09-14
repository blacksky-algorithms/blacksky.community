import {View, type ViewStyle} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {
  AppBar,
  Eyebrow,
  Footer,
  PrimaryButton,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepAssembly() {
  const {_} = useLingui()
  const openLink = useOpenLink()
  const t = useTheme()
  const {dispatch} = useOnboardingInternalState()

  return (
    <View style={[a.flex_1, a.gap_lg]}>
      <AppBar
        showBack
        onBack={() => dispatch({type: 'prev'})}
        onHelp={() => openLink(FEEDBACK_FORM_URL({}))}
      />

      <Eyebrow label={_(msg`People's Assembly`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Have a say</Trans>
        </Text>
        <Text
          style={[
            a.text_md,
            a.leading_snug,
            t.atoms.text,
            {fontWeight: '300', fontSize: 14, lineHeight: 22},
          ]}>
          <Trans>
            Vote on platform decisions, make proposals, and offer feedback
            through our People's Assembly.
          </Trans>
        </Text>
      </View>

      <View style={[a.py_sm]}>
        <StatementCard />
      </View>

      <Footer>
        <PrimaryButton
          label={_(msg`Continue`)}
          onPress={() => dispatch({type: 'next'})}
        />
      </Footer>
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
        {borderRadius: 18},
        a.border,
        {backgroundColor: '#211f36'},
        {borderColor: '#8686ff'},
      ]}>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <Logomark width={18} fill="#F8FAF9" />
        <Text style={[a.text_sm, a.font_bold, {color: '#F8FAF9'}]}>
          <Trans>People's Assembly</Trans>
        </Text>
      </View>

      <View
        style={[
          a.gap_sm,
          a.p_md,
          a.rounded_sm,
          a.border,
          {backgroundColor: '#ffffff', marginLeft: 32},
          {borderColor: '#8686ff'},
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <View
            style={[
              {backgroundColor: '#9C9E9E'},
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
        style={[a.text_xs, a.leading_tight, {color: '#F8FAF9'}]}
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
  return (
    <View
      style={[
        {backgroundColor: tone === 'strong' ? '#000000' : '#9C9E9E'},
        {height: 8, borderRadius: 8, width: width ?? '100%'},
      ]}
    />
  )
}
