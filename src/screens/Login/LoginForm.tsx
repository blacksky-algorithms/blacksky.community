import {useRef, useState} from 'react'
import {Keyboard, LayoutAnimation, Platform, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {useSessionApi} from '#/state/session'
import {getOAuthClient, signInNativeAndroid} from '#/state/session/oauth-client'
import {
  isHandleResolutionError,
  resolveDeactivatedHandle,
} from '#/state/session/resolveForLogin'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as At} from '#/components/icons/At'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {FormContainer} from './FormContainer'

export const LoginForm = ({
  error,
  initialHandle,
  setError,
  onPressBack,
}: {
  error: string
  initialHandle: string
  setError: (v: string) => void
  onPressBack: () => void
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [awaitingRedirect, setAwaitingRedirect] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const identifierValueRef = useRef<string>(initialHandle || '')
  const t = useTheme()
  const {_} = useLingui()
  const {login} = useSessionApi()

  const onPressNext = async () => {
    if (isProcessing) return
    Keyboard.dismiss()
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setError('')

    const identifier = identifierValueRef.current.trim()

    if (!identifier) {
      setError(_(msg`Please enter your username or handle`))
      return
    }

    setIsProcessing(true)

    const client = getOAuthClient()
    const controller = Platform.OS === 'android' ? new AbortController() : null
    if (controller) {
      abortRef.current = controller
      setAwaitingRedirect(true)
    }
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Expo OAuth types do not resolve in Linux CI */
    const doSignIn = (id: string) =>
      controller
        ? signInNativeAndroid(client, id, {signal: controller.signal})
        : client.signIn(id)

    try {
      let session
      try {
        session = await doSignIn(identifier)
      } catch (e) {
        if (!isHandleResolutionError(e)) throw e
        if (controller?.signal.aborted) throw new Error('OAUTH_CANCELLED')
        const did = await resolveDeactivatedHandle(identifier)
        if (controller?.signal.aborted) throw new Error('OAUTH_CANCELLED')
        session = await doSignIn(did)
      }
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      // On native, signInNativeAndroid/signIn returns the session directly.
      // On web, the browser redirects away and App.web.tsx handles the callback.
      if (Platform.OS !== 'web' && session) {
        await login(
          {service: '', identifier: '', password: '', oauthSession: session},
          'LoginForm',
        )
      }
    } catch (e) {
      const errMsg = String(e)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      if (errMsg.includes('OAUTH_CANCELLED')) {
        // User-initiated cancel (Android): silent reset, no error banner.
      } else if (isNetworkError(e)) {
        logger.warn('Failed to start OAuth sign-in due to network error', {
          error: errMsg,
        })
        setError(
          _(
            msg`Unable to contact your service. Please check your Internet connection.`,
          ),
        )
      } else {
        logger.warn('Failed to start OAuth sign-in', {error: errMsg})
        setError(cleanError(errMsg))
      }
    } finally {
      setIsProcessing(false)
      setAwaitingRedirect(false)
      abortRef.current = null
    }
  }

  return (
    <FormContainer testID="loginForm" titleText={<Trans>Sign in</Trans>}>
      <View>
        <TextField.LabelText>
          <Trans>Account</Trans>
        </TextField.LabelText>
        <View style={[a.gap_sm]}>
          <TextField.Root>
            <TextField.Icon icon={At} />
            <TextField.Input
              testID="loginUsernameInput"
              label={_(msg`Username or handle`)}
              autoCapitalize="none"
              autoFocus
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="done"
              textContentType="username"
              defaultValue={initialHandle || ''}
              onChangeText={v => {
                identifierValueRef.current = v
              }}
              onSubmitEditing={onPressNext}
              editable={!isProcessing}
              accessibilityHint={_(
                msg`Enter your handle (e.g. alice.bsky.social)`,
              )}
            />
          </TextField.Root>
        </View>
      </View>
      <FormError error={error} />
      {awaitingRedirect && (
        <Text style={[a.text_sm, a.text_center, t.atoms.text_contrast_medium]}>
          <Trans>
            Finishing sign-in… complete it in your browser, or cancel.
          </Trans>
        </Text>
      )}
      <View style={[a.flex_row, a.align_center, a.pt_md]}>
        <Button
          label={_(msg`Back`)}
          variant="solid"
          color="secondary"
          size="large"
          onPress={onPressBack}>
          <ButtonText>
            <Trans>Back</Trans>
          </ButtonText>
        </Button>
        <View style={a.flex_1} />
        {awaitingRedirect ? (
          <Button
            testID="loginCancelButton"
            label={_(msg`Cancel`)}
            accessibilityHint={_(msg`Cancels the sign-in process`)}
            variant="solid"
            color="secondary"
            size="large"
            onPress={() => abortRef.current?.abort()}>
            <ButtonText>
              <Trans>Cancel</Trans>
            </ButtonText>
          </Button>
        ) : (
          <Button
            testID="loginNextButton"
            label={_(msg`Login`)}
            accessibilityHint={_(msg`Starts the sign-in process`)}
            variant="solid"
            color="primary"
            size="large"
            onPress={onPressNext}>
            <ButtonText>
              <Trans>Login</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}
      </View>
    </FormContainer>
  )
}
