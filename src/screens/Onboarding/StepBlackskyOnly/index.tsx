import {View} from 'react-native'
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

export function StepBlackskyOnly() {
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

      <Eyebrow label={_(msg`Blacksky-only posts`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Keep it in the community</Trans>
        </Text>
        <Text
          style={[
            a.text_md,
            a.leading_snug,
            t.atoms.text,
            {fontWeight: '300', fontSize: 14, lineHeight: 22},
          ]}>
          <Trans>
            Share posts that only other members of the Blacksky community can
            see.
          </Trans>
        </Text>
      </View>

      <View style={[a.py_sm]}>
        <SkeletonPostCard />
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

function SkeletonPostCard() {
  const {_} = useLingui()
  const t = useTheme()

  return (
    <View
      style={[
        a.flex_row,
        a.gap_sm,
        a.p_md,
        {borderRadius: 18},
        a.border,
        {backgroundColor: '#211f36'},
        {borderColor: '#8686ff'},
      ]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          {backgroundColor: '#8686ff'},
          {width: 40, height: 40, borderRadius: 20},
        ]}>
        <Logomark width={20} fill="#161E27" />
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
              {backgroundColor: '#464985'},
            ]}>
            <Logomark width={12} fill="#161E27" />
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
  return (
    <View
      style={[
        {backgroundColor: tone === 'strong' ? '#F8FAF9' : '#9C9E9E'},
        {height: 10, borderRadius: 8, width: width ?? '100%'},
      ]}
    />
  )
}
