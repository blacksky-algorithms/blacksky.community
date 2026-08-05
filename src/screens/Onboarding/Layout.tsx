import {useEffect, useRef} from 'react'
import {ScrollView, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useOnboardingDispatch} from '#/state/shell'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {
  atoms as a,
  type TextStyleProp,
  tokens,
  useBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {createPortalGroup} from '#/components/Portal'
import {P, Text} from '#/components/Typography'
import {IS_ANDROID, IS_INTERNAL, IS_WEB} from '#/env'

const ONBOARDING_COL_WIDTH = 420

export const OnboardingControls = createPortalGroup()
export const OnboardingHeaderSlot = createPortalGroup()

export function Layout({children}: React.PropsWithChildren<{}>) {
  const {_} = useLingui()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const {gtMobile} = useBreakpoints()
  const onboardDispatch = useOnboardingDispatch()
  const {state} = useOnboardingInternalState()
  const scrollview = useRef<ScrollView>(null)
  const prevActiveStep = useRef<string>(state.activeStep)

  useEffect(() => {
    if (state.activeStep !== prevActiveStep.current) {
      prevActiveStep.current = state.activeStep
      scrollview.current?.scrollTo({y: 0, animated: false})
    }
  }, [state])

  const dialogLabel = _(msg`Set up your account`)

  return (
    <View
      aria-modal
      role="dialog"
      aria-role="dialog"
      aria-label={dialogLabel}
      accessibilityLabel={dialogLabel}
      accessibilityHint={_(msg`Customizes your Blacksky experience`)}
      style={[IS_WEB ? a.fixed : a.absolute, a.inset_0, a.flex_1, t.atoms.bg]}>
      {IS_INTERNAL && (
        <View
          style={[
            a.absolute,
            a.align_center,
            a.z_20,
            {top: 0, left: 0, right: 0, paddingTop: insets.top},
          ]}>
          <Button
            variant="ghost"
            color="negative"
            size="tiny"
            onPress={() => onboardDispatch({type: 'skip'})}
            // DEV ONLY
            label="Clear onboarding state">
            <ButtonText>[DEV] Clear</ButtonText>
          </Button>
        </View>
      )}

      <ScrollView
        ref={scrollview}
        style={[a.h_full, a.w_full]}
        contentContainerStyle={{
          borderWidth: 0,
          minHeight: '100%',
          paddingTop: gtMobile ? 40 : insets.top,
          paddingBottom: insets.bottom + tokens.space.xl,
        }}
        showsVerticalScrollIndicator={!IS_ANDROID}
        scrollIndicatorInsets={{bottom: 0}}
        // @ts-expect-error web only --prf
        dataSet={{'stable-gutters': 1}}
        centerContent={gtMobile}>
        <View
          style={[a.flex_row, a.justify_center, gtMobile ? a.px_5xl : a.px_xl]}>
          <View style={[a.flex_1, web({maxWidth: ONBOARDING_COL_WIDTH})]}>
            <View style={[a.w_full, a.py_md]}>{children}</View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export function OnboardingPosition() {
  const {state} = useOnboardingInternalState()
  const t = useTheme()

  return (
    <Text style={[a.text_sm, a.font_medium, t.atoms.text_contrast_medium]}>
      <Trans>
        Step {state.activeStepIndex + 1} of {state.totalSteps}
      </Trans>
    </Text>
  )
}

export function OnboardingTitleText({
  children,
  style,
}: React.PropsWithChildren<TextStyleProp>) {
  return (
    <Text style={[a.text_3xl, a.font_bold, a.leading_snug, style]}>
      {children}
    </Text>
  )
}

export function OnboardingDescriptionText({
  children,
  style,
}: React.PropsWithChildren<TextStyleProp>) {
  const t = useTheme()
  return (
    <P style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium, style]}>
      {children}
    </P>
  )
}
