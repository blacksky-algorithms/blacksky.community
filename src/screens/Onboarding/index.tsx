import {useMemo, useReducer} from 'react'
import {View} from 'react-native'

import {
  Layout,
  OnboardingControls,
  OnboardingHeaderSlot,
} from '#/screens/Onboarding/Layout'
import {
  Context,
  createInitialOnboardingState,
  reducer,
} from '#/screens/Onboarding/state'
import {StepAssembly} from '#/screens/Onboarding/StepAssembly'
import {StepBelong} from '#/screens/Onboarding/StepBelong'
import {StepBlackskyOnly} from '#/screens/Onboarding/StepBlackskyOnly'
import {StepFinished} from '#/screens/Onboarding/StepFinished'
import {StepPinFeeds} from '#/screens/Onboarding/StepPinFeeds'
import {StepProfile} from '#/screens/Onboarding/StepProfile'
import {atoms as a, useTheme} from '#/alf'
import {Portal} from '#/components/Portal'
import {ScreenTransition} from '#/components/ScreenTransition'

export function Onboarding() {
  const t = useTheme()

  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    createInitialOnboardingState,
  )

  return (
    <Portal>
      <View style={[a.absolute, a.inset_0, t.atoms.bg]}>
        <OnboardingControls.Provider>
          <OnboardingHeaderSlot.Provider>
            <Context.Provider
              value={useMemo(() => ({state, dispatch}), [state, dispatch])}>
              <ScreenTransition
                key={state.activeStep}
                direction={state.stepTransitionDirection}
                style={a.flex_1}>
                <Layout>
                  {state.activeStep === 'profile' && <StepProfile />}
                  {state.activeStep === 'pin-feeds' && <StepPinFeeds />}
                  {state.activeStep === 'belong' && <StepBelong />}
                  {state.activeStep === 'blacksky-only' && <StepBlackskyOnly />}
                  {state.activeStep === 'assembly' && <StepAssembly />}
                  {state.activeStep === 'finished' && <StepFinished />}
                </Layout>
              </ScreenTransition>
            </Context.Provider>
          </OnboardingHeaderSlot.Provider>
        </OnboardingControls.Provider>
      </View>
    </Portal>
  )
}
