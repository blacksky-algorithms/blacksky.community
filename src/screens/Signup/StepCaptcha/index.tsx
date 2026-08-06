import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Platform, View} from 'react-native'
import ReactNativeDeviceAttest from 'react-native-device-attest'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {nanoid} from 'nanoid/non-secure'

import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {createFullHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useSignupContext} from '#/screens/Signup/state'
import {CaptchaWebView} from '#/screens/Signup/StepCaptcha/CaptchaWebView'
import {atoms as a, useTheme} from '#/alf'
import {FormError} from '#/components/forms/FormError'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {GCP_PROJECT_ID, IS_ANDROID, IS_IOS, IS_NATIVE, IS_WEB} from '#/env'

const CAPTCHA_PATH = '/gate/signup'
const ATTEST_PATH = '/gate/signup/attempt-attest'

export function StepCaptcha() {
  if (IS_WEB) {
    return <StepCaptchaInner />
  } else {
    return <StepCaptchaNative />
  }
}

export function StepCaptchaNative() {
  const [token, setToken] = useState<string>()
  const [payload, setPayload] = useState<string>()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      logger.debug('trying to generate attestation token...')
      try {
        if (IS_IOS) {
          logger.debug('starting to generate devicecheck token...')
          const token = await ReactNativeDeviceAttest.getDeviceCheckToken()
          setToken(token)
          logger.debug(`generated devicecheck token: ${token}`)
        } else {
          const {token, payload} =
            await ReactNativeDeviceAttest.getIntegrityToken('signup')
          setToken(token)
          setPayload(base64UrlEncode(payload))
        }
      } catch (err) {
        const e = err as Error
        logger.error(e)
      } finally {
        setReady(true)
      }
    })()
  }, [])

  if (!ready) {
    return <View />
  }

  return <StepCaptchaInner token={token} payload={payload} />
}

function StepCaptchaInner({
  token,
  payload,
}: {
  token?: string
  payload?: string
}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const theme = useTheme()
  const openLink = useOpenLink()
  const {state, dispatch} = useSignupContext()

  const [completed, setCompleted] = useState(false)

  const stateParam = useMemo(() => nanoid(15), [])

  // Build both the standard captcha URL and (when applicable) the
  // attestation-first URL. We optimistically try attestation and fall back to
  // the captcha URL if the attestation endpoint is unavailable on this PDS - so
  // account creation never breaks on a PDS that lacks the attestation route or
  // credentials. See CaptchaWebView's fallback handling.
  const {captchaUrl, attestUrl} = useMemo(() => {
    const build = (path: string, withAttestation: boolean) => {
      const newUrl = new URL(state.serviceUrl)
      newUrl.pathname = path
      newUrl.searchParams.set(
        'handle',
        createFullHandle(state.handle, state.userDomain),
      )
      newUrl.searchParams.set('state', stateParam)
      newUrl.searchParams.set('colorScheme', theme.name)

      if (IS_WEB) {
        // @ts-ignore web only
        newUrl.searchParams.set('redirect_url', window.location.origin)
      }

      if (withAttestation && IS_NATIVE && token) {
        newUrl.searchParams.set('platform', Platform.OS)
        newUrl.searchParams.set('token', token)
        if (IS_ANDROID && payload) {
          newUrl.searchParams.set('payload', payload)
        }
      }

      return newUrl.href
    }

    // Only attempt attestation on native, when a project is configured, and we
    // actually managed to generate a token. Otherwise go straight to captcha.
    const attestUrl =
      IS_NATIVE && GCP_PROJECT_ID !== 0 && token
        ? build(ATTEST_PATH, true)
        : undefined

    return {captchaUrl: build(CAPTCHA_PATH, false), attestUrl}
  }, [
    state.serviceUrl,
    state.handle,
    state.userDomain,
    stateParam,
    theme.name,
    token,
    payload,
  ])

  const url = attestUrl ?? captchaUrl
  const fallbackUrl = attestUrl ? captchaUrl : undefined

  const onSuccess = useCallback(
    (code: string) => {
      setCompleted(true)
      ax.metric('signup:captchaSuccess', {})
      dispatch({
        type: 'submit',
        task: {verificationCode: code, mutableProcessed: false},
      })
    },
    [ax, dispatch],
  )

  const onError = useCallback(
    (error?: unknown) => {
      dispatch({
        type: 'setError',
        value: _(msg`Error receiving captcha response.`),
      })
      ax.metric('signup:captchaFailure', {})
      logger.error('Signup Flow Error', {
        registrationHandle: state.handle,
        error,
      })
    },
    [_, ax, dispatch, state.handle],
  )

  const onBackPress = useCallback(() => {
    logger.error('Signup Flow Error', {
      errorMessage:
        'User went back from captcha step. Possibly encountered an error.',
      registrationHandle: state.handle,
    })

    dispatch({type: 'prev'})
  }, [dispatch, state.handle])

  return (
    <View style={[a.gap_lg]}>
      <AppBar
        showBack
        onBack={onBackPress}
        onHelp={() => openLink(FEEDBACK_FORM_URL({email: state.email}))}
      />

      <Eyebrow step={3} total={4} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Complete the challenge</Trans>
        </Text>
        <Text
          style={[a.text_md, a.leading_snug, theme.atoms.text_contrast_medium]}>
          <Trans>
            hCaptcha helps us reduce the number of bots in our community.
          </Trans>
        </Text>
      </View>

      <View
        style={[
          a.w_full,
          a.overflow_hidden,
          a.rounded_md,
          {minHeight: 510},
          completed && [a.align_center, a.justify_center],
        ]}>
        {!completed ? (
          <CaptchaWebView
            key={url}
            url={url}
            fallbackUrl={fallbackUrl}
            stateParam={stateParam}
            state={state}
            onComplete={() => setCompleted(true)}
            onSuccess={onSuccess}
            onError={onError}
          />
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>

      <FormError error={state.error} />

      <PrimaryButton
        testID="captchaContinueBtn"
        label={_(msg`Continue`)}
        onPress={() => {}}
        disabled
      />
    </View>
  )
}

function base64UrlEncode(data: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(data)

  const binaryString = String.fromCharCode(...bytes)
  const base64 = btoa(binaryString)

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]/g, '')
}
