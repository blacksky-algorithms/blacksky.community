import {useEffect, useRef, useState} from 'react'
import {Keyboard, LayoutAnimation, Platform, View} from 'react-native'
import {type ComAtprotoServerDescribeServer} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {
  buildHandleCandidates,
  isCorrectedLoginIdentifier,
  normalizeLoginIdentifier,
} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useSessionApi} from '#/state/session'
import {getOAuthClient, signInNativeAndroid} from '#/state/session/oauth-client'
import {
  isHandleResolutionError,
  resolveBareNameToHandles,
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
  serviceDescription,
  initialHandle,
  setError,
  onPressBack,
}: {
  error: string
  serviceDescription: ComAtprotoServerDescribeServer.OutputSchema | undefined
  initialHandle: string
  setError: (v: string) => void
  onPressBack: () => void
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [awaitingRedirect, setAwaitingRedirect] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const processingRef = useRef(false)
  const [identifierValue, setIdentifierValue] = useState<string>(
    initialHandle || '',
  )
  const [handleOptions, setHandleOptions] = useState<string[] | null>(null)
  const [showGuessConfirm, setShowGuessConfirm] = useState(false)
  const t = useTheme()
  const {_} = useLingui()
  const {login} = useSessionApi()

  // Drop any pending sign-in when the screen goes away. Hardware back and the
  // header back button pop this form without routing through onPressBack, so
  // anything hung off a press handler would leave the redirect listener armed —
  // and a stale listener matches on URL shape alone, so it would swallow the
  // *next* attempt's redirect and spend its authorization state.
  useEffect(() => () => abortRef.current?.abort(), [])

  const onPressNext = async () => {
    if (isProcessing || processingRef.current) return
    processingRef.current = true
    try {
      Keyboard.dismiss()
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setError('')
      setHandleOptions(null)
      setShowGuessConfirm(false)

      const identifier = normalizeLoginIdentifier(identifierValue)

      if (!identifier) {
        setError(_(msg`Please enter your username or handle`))
        return
      }

      if (isCorrectedLoginIdentifier(identifierValue, identifier)) {
        setIdentifierValue(identifier)
        setShowGuessConfirm(true)
        return
      }

      if (!identifier.startsWith('did:') && !identifier.includes('.')) {
        if (!serviceDescription) {
          setError(
            _(
              msg`Unable to contact your service. Please check your Internet connection.`,
            ),
          )
          return
        }
        setIsProcessing(true)
        try {
          const matches = await resolveBareNameToHandles(
            identifier,
            serviceDescription.availableUserDomains,
          )
          if (matches.length === 0) {
            const examples = buildHandleCandidates(
              identifier,
              serviceDescription.availableUserDomains,
            )
              .slice(0, 2)
              .join(' or ')
            setError(
              _(
                msg`We couldn't find an account for "${identifier}". Enter your full handle including its domain (like ${examples})`,
              ),
            )
            return
          }
          if (matches.length > 1) {
            setHandleOptions(matches)
            return
          }
          setIdentifierValue(matches[0])
          setShowGuessConfirm(true)
          return
        } catch (e) {
          logger.warn('Failed to resolve bare name during sign-in', {
            error: String(e),
          })
          setError(
            _(
              msg`Unable to contact your service. Please check your Internet connection.`,
            ),
          )
          return
        } finally {
          setIsProcessing(false)
        }
      }

      setIdentifierValue(identifier)
      await signInWithIdentifier(identifier)
    } finally {
      processingRef.current = false
    }
  }

  const onPressHandleOption = (handle: string) => {
    if (isProcessing) return
    setHandleOptions(null)
    setError('')
    setIdentifierValue(handle)
    setShowGuessConfirm(true)
  }

  const signInWithIdentifier = async (identifier: string) => {
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
      } else if (isHandleResolutionError(e)) {
        logger.warn('Failed to resolve handle during sign-in', {
          error: errMsg,
        })
        setError(
          _(
            msg`We couldn't find an account with the handle "${identifier}". Check the spelling, or create a new account if you don't have one yet.`,
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
              value={identifierValue}
              onChangeText={v => {
                setIdentifierValue(v)
                if (handleOptions) {
                  setHandleOptions(null)
                }
                if (showGuessConfirm) {
                  setShowGuessConfirm(false)
                }
              }}
              onSubmitEditing={() => void onPressNext()}
              editable={!isProcessing}
              accessibilityHint={_(
                msg`Enter your handle (e.g. alice.bsky.social)`,
              )}
            />
          </TextField.Root>
        </View>
      </View>
      <FormError error={error} />
      {handleOptions && (
        <View style={[a.gap_xs]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>
              We found more than one account with that name. Which one is yours?
            </Trans>
          </Text>
          {handleOptions.map(handle => (
            <Button
              key={handle}
              testID={`handleOption-${handle}`}
              label={_(msg`Sign in as ${handle}`)}
              variant="outline"
              color="primary"
              size="large"
              onPress={() => onPressHandleOption(handle)}>
              <ButtonText>{handle}</ButtonText>
            </Button>
          ))}
        </View>
      )}
      {showGuessConfirm && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            We filled in our best guess at your full handle. If it looks right,
            press Login to continue
          </Trans>
        </Text>
      )}
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
            onPress={() => void onPressNext()}>
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
