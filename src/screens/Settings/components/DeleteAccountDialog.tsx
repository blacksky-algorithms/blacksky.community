import {useCallback, useRef, useState} from 'react'
import {type TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {gateRequestAccountDelete} from '#/lib/api/gatekeeper'
import {DM_SERVICE_HEADERS} from '#/lib/constants'
import {useCleanError} from '#/lib/hooks/useCleanError'
import {useIsBlackskyPds} from '#/lib/hooks/useIsBlackskyPds'
import {sanitizeHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useAgent, useSession, useSessionApi} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {type DialogOuterProps} from '#/components/Dialog'
import {
  isValidCode,
  TokenField,
} from '#/components/dialogs/EmailDialog/components/TokenField'
import * as TextField from '#/components/forms/TextField'
import {Envelope_Stroke2_Corner0_Rounded as Envelope} from '#/components/icons/Envelope'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {createStaticClick, SimpleInlineLinkText} from '#/components/Link'
import {Loader} from '#/components/Loader'
import * as Prompt from '#/components/Prompt'
import * as toast from '#/components/Toast'
import {Span, Text} from '#/components/Typography'
import {resetToTab} from '#/Navigation'

const WHITESPACE_RE = /\s/gu
const PASSWORD_MIN_LENGTH = 8

enum Step {
  SEND_CODE,
  VERIFY_CODE,
  CONFIRM_DELETION,
}

enum EmailState {
  DEFAULT,
  PENDING,
}

function isPasswordValid(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH
}

export function DeleteAccountDialog({
  control,
  deactivateDialogControl,
}: {
  control: DialogOuterProps['control']
  deactivateDialogControl: DialogOuterProps['control']
}) {
  return (
    <Prompt.Outer control={control}>
      <DeleteAccountDialogInner
        control={control}
        deactivateDialogControl={deactivateDialogControl}
      />
    </Prompt.Outer>
  )
}

function DeleteAccountDialogInner({
  control,
  deactivateDialogControl,
}: {
  control: DialogOuterProps['control']
  deactivateDialogControl: DialogOuterProps['control']
}) {
  const passwordRef = useRef<TextInput | null>(null)
  const t = useTheme()
  const {_} = useLingui()
  const cleanError = useCleanError()
  const agent = useAgent()
  const {currentAccount} = useSession()
  const {removeAccount} = useSessionApi()

  const [emailState, setEmailState] = useState(EmailState.DEFAULT)
  const [emailSentCount, setEmailSentCount] = useState(0)
  const [step, setStep] = useState(Step.SEND_CODE)
  const [confirmCode, setConfirmCode] = useState('')
  const [password, setPassword] = useState('')
  const [authFactorToken, setAuthFactorToken] = useState('')
  const [authFactorRequired, setAuthFactorRequired] = useState(false)
  const [error, setError] = useState('')

  // OAuth sessions cannot call requestAccountDelete directly (the PDS
  // requires a full password session), so on gatekeeper-fronted PDSes we
  // route the request through the gatekeeper, which verifies the password
  // and mints a session server-side. Same pattern as DeactivateAccountDialog.
  const isOauth = currentAccount?.isOauthSession === true
  const isBlackskyPds = useIsBlackskyPds()
  const useGatekeeper = isOauth && isBlackskyPds

  const sendEmail = useCallback(async () => {
    if (emailState === EmailState.PENDING) {
      return
    }
    try {
      setEmailState(EmailState.PENDING)
      if (useGatekeeper) {
        if (!currentAccount?.did || !currentAccount?.service) {
          throw new Error('Invalid session')
        }
        const {status} = await gateRequestAccountDelete({
          serviceUrl: currentAccount.service,
          did: currentAccount.did,
          password,
          authFactorToken:
            authFactorToken.replace(WHITESPACE_RE, '') || undefined,
        })
        if (status === 'authFactorTokenRequired') {
          // The PDS has emailed a sign-in code (2FA). Collect it and retry.
          setAuthFactorRequired(true)
          setStep(Step.SEND_CODE)
          setError('')
          return
        }
      } else {
        await agent.com.atproto.server.requestAccountDelete()
      }
      setError('')
      setEmailSentCount(prevCount => prevCount + 1)
      setStep(Step.VERIFY_CODE)
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'Invalid password') {
        setError(_(msg`Invalid password. Please try again.`))
      } else {
        const {clean, raw} = cleanError(e)
        setError(clean || raw || String(e))
      }
      logger.error('Failed to send account deletion verification email', {
        error: e,
      })
    } finally {
      setEmailState(EmailState.DEFAULT)
    }
  }, [
    _,
    agent,
    authFactorToken,
    cleanError,
    currentAccount,
    emailState,
    password,
    useGatekeeper,
  ])

  const confirmDeletion = useCallback(async () => {
    try {
      setError('')
      if (!currentAccount?.did) {
        throw new Error('Invalid did')
      }
      const token = confirmCode.replace(WHITESPACE_RE, '')
      // Inform chat service of intent to delete account. Best-effort: a
      // failure here (chat service down, account never used chat) must not
      // block the actual account deletion.
      try {
        await agent.chat.bsky.actor.deleteAccount(undefined, {
          headers: DM_SERVICE_HEADERS,
        })
      } catch (e: unknown) {
        logger.error('Failed to inform chat service of account deletion', {
          error: e,
        })
      }
      await agent.com.atproto.server.deleteAccount({
        did: currentAccount.did,
        password,
        token,
      })
      control.close(() => {
        toast.show(_(msg`Your account has been deleted, see ya! ✌️`))
        resetToTab('HomeTab')
        removeAccount(currentAccount)
      })
    } catch (e: unknown) {
      const {clean, raw} = cleanError(e)
      setError(clean || raw || String(e))
      logger.error('Failed to delete account', {
        error: e,
      })
      setConfirmCode('')
      setPassword('')
      setStep(Step.VERIFY_CODE)
    }
  }, [
    _,
    agent,
    cleanError,
    confirmCode,
    control,
    currentAccount,
    password,
    removeAccount,
  ])

  const handleDeactivate = useCallback(() => {
    control.close(() => deactivateDialogControl.open())
  }, [control, deactivateDialogControl])

  const handleSendEmail = useCallback(() => {
    void sendEmail()
  }, [sendEmail])

  const handleSubmitConfirmCode = useCallback(() => {
    passwordRef.current?.focus()
  }, [])

  const handleDeleteAccount = useCallback(() => {
    setStep(Step.CONFIRM_DELETION)
  }, [setStep])

  const handleConfirmDeletion = useCallback(() => {
    void confirmDeletion()
  }, [confirmDeletion])

  const currentHandle = sanitizeHandle(currentAccount?.handle ?? '', '@')
  const currentEmail = currentAccount?.email ?? '(no email)'

  switch (step) {
    case Step.SEND_CODE:
      return (
        <>
          <Prompt.Content>
            <Prompt.TitleText>
              {_(msg`Delete account “${currentHandle}”`)}
            </Prompt.TitleText>
            <Prompt.DescriptionText>
              <Trans>
                For security reasons, we’ll need to send a confirmation code to
                your email address{' '}
                <Span style={[a.font_semi_bold, t.atoms.text]}>
                  {currentEmail}
                </Span>
                .
              </Trans>
            </Prompt.DescriptionText>
          </Prompt.Content>
          {useGatekeeper && (
            <View style={[a.mb_lg]}>
              <TextField.LabelText>
                <Trans>Password</Trans>
              </TextField.LabelText>
              <TextField.Root>
                <TextField.Icon icon={Lock} />
                <TextField.Input
                  testID="deleteAccountPasswordInput"
                  label={_(msg`Enter your password`)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  secureTextEntry={true}
                  autoComplete="off"
                  clearButtonMode="while-editing"
                  passwordRules={`minlength: ${PASSWORD_MIN_LENGTH}};`}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleSendEmail}
                />
              </TextField.Root>
            </View>
          )}
          {useGatekeeper && authFactorRequired && (
            <View style={[a.mb_lg]}>
              <TextField.LabelText>
                <Trans>Sign in code</Trans>
              </TextField.LabelText>
              <TokenField
                value={authFactorToken}
                onChangeText={setAuthFactorToken}
                onSubmitEditing={handleSendEmail}
              />
              <Text
                style={[
                  a.text_sm,
                  a.leading_snug,
                  a.mt_xs,
                  t.atoms.text_contrast_medium,
                ]}>
                <Trans>
                  Your account has two-factor authentication enabled. A sign in
                  code has been sent to your email address — enter it above,
                  then press Send email again.
                </Trans>
              </Text>
            </View>
          )}
          <Prompt.Actions>
            <Prompt.Action
              icon={emailState === EmailState.PENDING ? Loader : Envelope}
              cta={_(msg`Send email`)}
              disabled={
                useGatekeeper &&
                (!isPasswordValid(password) ||
                  (authFactorRequired && !isValidCode(authFactorToken)))
              }
              shouldCloseOnPress={false}
              onPress={handleSendEmail}
            />
            <Prompt.Cancel />
          </Prompt.Actions>
          {error && (
            <Admonition style={[a.mt_lg]} type="error">
              <Text style={[a.flex_1, a.leading_snug]}>{error}</Text>
            </Admonition>
          )}
          <Admonition style={[a.mt_lg]} type="tip">
            <Trans>
              You can also{' '}
              <SimpleInlineLinkText
                label={_(msg`Temporarily deactivate your account`)}
                {...createStaticClick(handleDeactivate)}>
                temporarily deactivate
              </SimpleInlineLinkText>{' '}
              your account instead. Your profile, posts, feeds, and lists will
              no longer be visible to other Blacksky users. You can reactivate
              your account at any time by logging in.
            </Trans>
          </Admonition>
        </>
      )
    case Step.VERIFY_CODE:
      return (
        <>
          <Prompt.Content>
            <Prompt.TitleText>
              {_(msg`Delete account “${currentHandle}”`)}
            </Prompt.TitleText>
            <Prompt.DescriptionText>
              <Trans>
                Check{' '}
                <Span style={[a.font_semi_bold, t.atoms.text]}>
                  {currentEmail}
                </Span>{' '}
                for an email with the confirmation code to enter below:
              </Trans>
            </Prompt.DescriptionText>
          </Prompt.Content>
          <View style={[a.mb_xs]}>
            <TextField.LabelText>
              <Trans>Confirmation code</Trans>
            </TextField.LabelText>
            <TokenField
              value={confirmCode}
              onChangeText={setConfirmCode}
              onSubmitEditing={handleSubmitConfirmCode}
            />
          </View>
          <Text
            style={[
              a.text_sm,
              a.leading_snug,
              a.mb_lg,
              t.atoms.text_contrast_medium,
            ]}>
            {emailSentCount > 1 ? (
              <Trans>
                Email sent!{' '}
                <SimpleInlineLinkText
                  label={_(msg`Click here to resend the email`)}
                  {...createStaticClick(handleSendEmail)}>
                  Click here to resend.
                </SimpleInlineLinkText>
              </Trans>
            ) : (
              <Trans>
                Don’t see a code?{' '}
                <SimpleInlineLinkText
                  label={_(msg`Click here to resend the email`)}
                  {...createStaticClick(handleSendEmail)}>
                  Click here to resend.
                </SimpleInlineLinkText>
              </Trans>
            )}{' '}
            <Span style={{top: 1}}>
              {emailState === EmailState.PENDING ? <Loader size="xs" /> : null}
            </Span>
          </Text>
          <View style={[a.mb_xl]}>
            <TextField.LabelText>
              <Trans>Password</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Icon icon={Lock} />
              <TextField.Input
                inputRef={passwordRef}
                testID="newPasswordInput"
                label={_(msg`Enter your password`)}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                secureTextEntry={true}
                autoComplete="off"
                clearButtonMode="while-editing"
                passwordRules={`minlength: ${PASSWORD_MIN_LENGTH}};`}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleDeleteAccount}
              />
            </TextField.Root>
          </View>
          <Prompt.Actions>
            <Prompt.Action
              color="negative"
              disabled={!isValidCode(confirmCode) || !isPasswordValid(password)}
              cta={_(msg`Delete my account`)}
              shouldCloseOnPress={false}
              onPress={handleDeleteAccount}
            />
            <Prompt.Cancel />
          </Prompt.Actions>
          {error && (
            <Admonition style={[a.mt_lg]} type="error">
              <Text style={[a.flex_1, a.leading_snug]}>{error}</Text>
            </Admonition>
          )}
        </>
      )
    case Step.CONFIRM_DELETION:
      return (
        <>
          <Prompt.Content>
            <Prompt.TitleText>
              {_(msg`Are you really, really sure?`)}
            </Prompt.TitleText>
            <Prompt.DescriptionText>
              <Trans>
                This will irreversibly delete your Blacksky account{' '}
                <Span style={[a.font_semi_bold, t.atoms.text]}>
                  {currentHandle}
                </Span>{' '}
                and all associated data. Note that this will affect any other{' '}
                <SimpleInlineLinkText
                  to="https://atproto.com/guides/faq"
                  label={_(msg`AT Protocol FAQ`)}>
                  AT Protocol
                </SimpleInlineLinkText>{' '}
                services you use with this account.
              </Trans>
            </Prompt.DescriptionText>
          </Prompt.Content>
          <Prompt.Actions>
            <Prompt.Action
              color="negative"
              cta={_(msg`Yes, delete my account`)}
              shouldCloseOnPress={false}
              onPress={handleConfirmDeletion}
            />
            <Prompt.Cancel />
          </Prompt.Actions>
        </>
      )
  }
}
