import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import {ScrollView, useWindowDimensions, View} from 'react-native'
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

const ScrollVisibilityContext = createContext<{
  subscribe: (listener: () => void) => () => void
  viewportTop: number
  viewportBottom: number
} | null>(null)

export function useOnboardingScrollViewVisibility(
  ref: React.RefObject<React.ComponentRef<typeof View> | null>,
  onVisible: () => void,
) {
  const context = useContext(ScrollVisibilityContext)

  if (!context) {
    throw new Error(
      'useOnboardingScrollViewVisibility must be used within Onboarding Layout',
    )
  }

  const {subscribe, viewportTop, viewportBottom} = context
  const checkVisibility = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (height <= 0) return
      const visibleHeight = Math.max(
        0,
        Math.min(y + height, viewportBottom) - Math.max(y, viewportTop),
      )
      if (visibleHeight / height >= 0.5) {
        onVisible()
      }
    })
  }, [onVisible, ref, viewportBottom, viewportTop])

  useEffect(() => {
    checkVisibility()
    return subscribe(checkVisibility)
  }, [checkVisibility, subscribe])

  return checkVisibility
}

export function Layout({children}: React.PropsWithChildren<{}>) {
  const {_} = useLingui()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const {gtMobile} = useBreakpoints()
  const onboardDispatch = useOnboardingDispatch()
  const {state} = useOnboardingInternalState()
  const scrollview = useRef<React.ComponentRef<typeof ScrollView>>(null)
  const prevActiveStep = useRef<string>(state.activeStep)

  useEffect(() => {
    if (state.activeStep !== prevActiveStep.current) {
      prevActiveStep.current = state.activeStep
      scrollview.current?.scrollTo({y: 0, animated: false})
    }
  }, [state])

  const dialogLabel = _(msg`Set up your account`)

  const {height: windowHeight} = useWindowDimensions()
  const visibilityListenersRef = useRef(new Set<() => void>())
  const subscribeToScroll = useCallback((listener: () => void) => {
    visibilityListenersRef.current.add(listener)
    return () => {
      visibilityListenersRef.current.delete(listener)
    }
  }, [])
  const scrollVisibilityContext = useMemo(
    () => ({
      subscribe: subscribeToScroll,
      viewportTop: 0,
      viewportBottom: windowHeight,
    }),
    [subscribeToScroll, windowHeight],
  )
  const onScroll = () => {
    for (const listener of visibilityListenersRef.current) {
      listener()
    }
  }

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
        onScroll={onScroll}
        scrollEventThrottle={100}
        style={[a.h_full, a.w_full]}
        contentContainerStyle={{
          borderWidth: 0,
          flexGrow: 1,
          paddingTop: gtMobile ? 40 : insets.top,
          paddingBottom: insets.bottom + tokens.space.xl,
        }}
        showsVerticalScrollIndicator={!IS_ANDROID}
        scrollIndicatorInsets={{bottom: 0}}
        // @ts-expect-error web only --prf
        dataSet={{'stable-gutters': 1}}
        centerContent={gtMobile}>
        <View
          style={[
            a.flex_1,
            a.flex_row,
            a.justify_center,
            gtMobile ? a.px_5xl : {paddingHorizontal: 24},
          ]}>
          <View style={[a.flex_1, web({maxWidth: ONBOARDING_COL_WIDTH})]}>
            <View style={[a.flex_1, a.w_full, a.py_md]}>
              <ScrollVisibilityContext.Provider value={scrollVisibilityContext}>
                {children}
              </ScrollVisibilityContext.Provider>
            </View>
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
