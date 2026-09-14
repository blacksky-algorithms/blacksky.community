import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {FEEDBACK_FORM_URL, webLinks} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {atoms as a, useTheme} from '#/alf'
import {Warning_Stroke2_Corner0_Rounded as Warning} from '#/components/icons/Warning'
import {InlineLinkText} from '#/components/Link'
import {
  AppBar,
  Eyebrow,
  Footer,
  PrimaryButton,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepBelong() {
  const {_} = useLingui()
  const openLink = useOpenLink()
  const t = useTheme()
  const {state, dispatch} = useOnboardingInternalState()
  const agreed = state.guidelinesAccepted

  return (
    <View style={[a.flex_1, a.gap_lg]}>
      <AppBar
        showBack
        onBack={() => dispatch({type: 'prev'})}
        onHelp={() => openLink(FEEDBACK_FORM_URL({}))}
      />

      <Eyebrow label={_(msg`Community moderation`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Belong, safely</Trans>
        </Text>
        <Text
          style={[
            a.text_md,
            a.leading_snug,
            t.atoms.text,
            {fontWeight: '300', fontSize: 14, lineHeight: 22},
          ]}>
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

      <Footer>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityHint=""
          accessibilityState={{checked: agreed}}
          aria-checked={agreed}
          accessibilityLabel={_(msg`I agree to the Community Guidelines`)}
          onPress={() =>
            dispatch({type: 'setGuidelinesAccepted', value: !agreed})
          }
          style={[a.flex_row, a.align_center, a.gap_sm, {minHeight: 44}]}>
          <View
            style={[
              a.border,
              a.align_center,
              a.justify_center,
              {width: 18, height: 18, borderColor: '#D2FC51'},
            ]}>
            {agreed && <Text style={{color: '#D2FC51'}}>✓</Text>}
          </View>
          <Text
            style={[
              a.flex_1,
              a.text_xs,
              a.leading_snug,
              t.atoms.text_contrast_medium,
            ]}>
            <Trans>
              I agree to the{' '}
              <InlineLinkText
                to={webLinks.community}
                label={_(msg`Read Community Guidelines`)}>
                Community Guidelines
              </InlineLinkText>
              .
            </Trans>
          </Text>
        </Pressable>
        <PrimaryButton
          disabled={!agreed}
          label={_(msg`Continue`)}
          onPress={() => dispatch({type: 'next'})}
        />
      </Footer>
    </View>
  )
}

function FlaggedPostCard({label, rotate}: {label: string; rotate: string}) {
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
        {transform: [{rotate}]},
      ]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          {backgroundColor: '#D2FC51'},
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

        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.px_sm,
            a.py_xs,
            a.rounded_sm,
            {backgroundColor: '#464985'},
          ]}>
          <Warning size="xs" fill="#161E27" />
          <Text
            style={[a.flex_1, a.text_xs, a.leading_tight, {color: '#F8FAF9'}]}
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
  return (
    <View
      style={[
        {backgroundColor: tone === 'strong' ? '#F8FAF9' : '#9C9E9E'},
        {height: 10, borderRadius: 8, width: width ?? '100%'},
      ]}
    />
  )
}
