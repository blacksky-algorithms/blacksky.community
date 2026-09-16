import {useEffect, useReducer, useState} from 'react'
import {AppState, type AppStateStatus, View} from 'react-native'
import ReactNativeDeviceAttest from 'react-native-device-attest'
import Animated, {FadeIn, LayoutAnimationConfig} from 'react-native-reanimated'
import {AppBskyGraphStarterpack} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {useBrand} from '#/lib/community/BrandContext'
import {fetchBrandBySlug} from '#/lib/community/resolveBrand'
import {logger} from '#/logger'
import {useServiceQuery} from '#/state/queries/service'
import {useStarterPackQuery} from '#/state/queries/starter-packs'
import {useActiveStarterPack} from '#/state/shell/landing'
import {
  initialState,
  reducer,
  SignupContext,
  SignupStep,
  useSubmitSignup,
} from '#/screens/Signup/state'
import {StepCaptcha} from '#/screens/Signup/StepCaptcha'
import {StepCommunity} from '#/screens/Signup/StepCommunity'
import {StepHandle} from '#/screens/Signup/StepHandle'
import {StepInfo} from '#/screens/Signup/StepInfo'
import {atoms as a, native} from '#/alf'
import {LinearGradientBackground} from '#/components/LinearGradientBackground'
import {Screen} from '#/components/onboarding-chrome'
import {ScreenTransition} from '#/components/ScreenTransition'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {GCP_PROJECT_ID, IS_ANDROID} from '#/env'
import * as bsky from '#/types/bsky'

export function Signup({
  onPressBack,
  onPressSignIn,
}: {
  onPressBack: () => void
  onPressSignIn?: (handle: string) => void
}) {
  const ax = useAnalytics()
  const {_} = useLingui()
  const brand = useBrand()
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    analytics: ax,
  })
  const submit = useSubmitSignup()

  useEffect(() => {
    dispatch({
      type: 'setAnalytics',
      value: ax,
    })
  }, [ax])

  useEffect(() => {
    if (brand.services.pds.url) {
      dispatch({
        type: 'setCommunity',
        slug: brand.metadata.slug,
        serviceUrl: brand.services.pds.url,
      })
    }
  }, [brand.services.pds.url, brand.metadata.slug])

  const selectedCommunitySlug = state.selectedBrandSlug
  const isCurrentBrand = selectedCommunitySlug === brand.metadata.slug
  const {data: selectedCommunity} = useQuery({
    queryKey: ['signup-selected-community', selectedCommunitySlug],
    queryFn: () => fetchBrandBySlug(selectedCommunitySlug!),
    enabled: Boolean(selectedCommunitySlug && !isCurrentBrand),
    staleTime: 300000,
  })
  const availableHandles = isCurrentBrand
    ? brand.services.pds.availableHandles
    : selectedCommunity?.services.pds.availableHandles

  const activeStarterPack = useActiveStarterPack()
  const {
    data: starterPack,
    isFetching: isFetchingStarterPack,
    isError: isErrorStarterPack,
  } = useStarterPackQuery({
    uri: activeStarterPack?.uri,
  })

  const [isFetchedAtMount] = useState(starterPack != null)
  const showStarterPackCard =
    activeStarterPack?.uri && !isFetchingStarterPack && starterPack

  const {
    data: serviceInfo,
    isFetching,
    isError,
    refetch,
  } = useServiceQuery(state.serviceUrl)

  useEffect(() => {
    if (isFetching) {
      dispatch({type: 'setIsLoading', value: true})
    } else if (!isFetching) {
      dispatch({type: 'setIsLoading', value: false})
    }
  }, [isFetching])

  useEffect(() => {
    if (isError) {
      dispatch({
        type: 'setServiceDescription',
        value: undefined,
        availableHandles,
      })
      dispatch({
        type: 'setError',
        value: _(
          msg`Unable to contact your service. Please check your Internet connection.`,
        ),
      })
    } else if (serviceInfo) {
      dispatch({
        type: 'setServiceDescription',
        value: serviceInfo,
        availableHandles,
      })
      dispatch({type: 'setError', value: ''})
    }
  }, [_, serviceInfo, isError, availableHandles])

  useEffect(() => {
    if (state.pendingSubmit) {
      if (!state.pendingSubmit.mutableProcessed) {
        state.pendingSubmit.mutableProcessed = true
        submit(state, dispatch)
      }
    }
  }, [state, dispatch, submit])

  // Track app backgrounding during signup
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'background') {
          dispatch({type: 'incrementBackgroundCount'})
        }
      },
    )

    return () => subscription.remove()
  }, [])

  // On Android, warmup the Play Integrity API on the signup screen so it is ready by the time we get to the gate screen.
  useEffect(() => {
    if (!IS_ANDROID) {
      return
    }
    ReactNativeDeviceAttest.warmupIntegrity(GCP_PROJECT_ID).catch(err =>
      logger.error(err),
    )
  }, [])

  return (
    <Animated.View exiting={native(FadeIn.duration(90))} style={a.flex_1}>
      <SignupContext.Provider value={{state, dispatch}}>
        <Screen>
          <View testID="createAccount" style={a.flex_1}>
            {showStarterPackCard &&
            bsky.dangerousIsType<AppBskyGraphStarterpack.Record>(
              starterPack.record,
              AppBskyGraphStarterpack.isRecord,
            ) ? (
              <Animated.View entering={!isFetchedAtMount ? FadeIn : undefined}>
                <LinearGradientBackground
                  style={[a.mx_lg, a.p_lg, a.gap_sm, a.rounded_sm]}>
                  <Text style={[a.font_semi_bold, a.text_xl, {color: 'white'}]}>
                    {starterPack.record.name}
                  </Text>
                  <Text style={[{color: 'white'}]}>
                    {starterPack.feeds?.length ? (
                      <Trans>
                        You'll follow the suggested users and feeds once you
                        finish creating your account!
                      </Trans>
                    ) : (
                      <Trans>
                        You'll follow the suggested users once you finish
                        creating your account!
                      </Trans>
                    )}
                  </Text>
                </LinearGradientBackground>
              </Animated.View>
            ) : null}
            <LayoutAnimationConfig skipEntering>
              <ScreenTransition
                key={state.activeStep}
                direction={state.screenTransitionDirection}
                style={a.flex_1}>
                <View style={[a.flex_1]}>
                  {state.activeStep === SignupStep.COMMUNITY ? (
                    <StepCommunity
                      onPressBack={() => dispatch({type: 'prev'})}
                    />
                  ) : state.activeStep === SignupStep.INFO ? (
                    <StepInfo
                      onPressBack={onPressBack}
                      isLoadingStarterPack={
                        isFetchingStarterPack && !isErrorStarterPack
                      }
                      isServerError={isError}
                      refetchServer={refetch}
                    />
                  ) : state.activeStep === SignupStep.HANDLE ? (
                    <StepHandle onPressSignIn={onPressSignIn} />
                  ) : (
                    <StepCaptcha />
                  )}
                </View>
              </ScreenTransition>
            </LayoutAnimationConfig>
          </View>
        </Screen>
      </SignupContext.Provider>
    </Animated.View>
  )
}
