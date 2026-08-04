import {useEffect, useRef, useState} from 'react'
import {type TextInput, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import * as EmailValidator from 'email-validator'
import type tldts from 'tldts'

import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {isEmailMaybeInvalid} from '#/lib/strings/email'
import {getAge} from '#/lib/strings/time'
import {logger} from '#/logger'
import {useSignupContext} from '#/screens/Signup/state'
import {Policies} from '#/screens/Signup/StepInfo/Policies'
import {atoms as a, native, useTheme} from '#/alf'
import * as Admonition from '#/components/Admonition'
import * as DateField from '#/components/forms/DateField'
import {type DateFieldRef} from '#/components/forms/DateField/types'
import {FormError} from '#/components/forms/FormError'
import {HostingProvider} from '#/components/forms/HostingProvider'
import {CalendarDays_Stroke2_Corner0_Rounded as CalendarDays} from '#/components/icons/CalendarDays'
import {Envelope_Stroke2_Corner0_Rounded as Envelope} from '#/components/icons/Envelope'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {Ticket_Stroke2_Corner0_Rounded as Ticket} from '#/components/icons/Ticket'
import {Loader} from '#/components/Loader'
import {
  AppBar,
  Eyebrow,
  InputGroup,
  PrimaryButton,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

function sanitizeDate(date: Date): Date {
  if (!date || date.toString() === 'Invalid Date') {
    logger.error(`Create account: handled invalid date for birthDate`, {
      hasDate: !!date,
    })
    return new Date()
  }
  return date
}

export function StepInfo({
  onPressBack,
  isServerError,
  refetchServer,
  isLoadingStarterPack,
}: {
  onPressBack: () => void
  isServerError: boolean
  refetchServer: () => void
  isLoadingStarterPack: boolean
}) {
  const {t: l, i18n} = useLingui()
  const t = useTheme()
  const ax = useAnalytics()
  const openLink = useOpenLink()
  const {state, dispatch} = useSignupContext()

  const [inviteCode, setInviteCode] = useState<string>(state.inviteCode)
  const [email, setEmail] = useState<string>(state.email)
  const [password, setPassword] = useState<string>(state.password)
  const prevEmailValueRef = useRef<string>(state.email)

  const emailInputRef = useRef<TextInput>(null)
  const passwordInputRef = useRef<TextInput>(null)
  const birthdateInputRef = useRef<DateFieldRef>(null)

  const isOverAppMinAccessAge = state.dateOfBirth
    ? getAge(state.dateOfBirth) >= 13
    : true
  const isOverMinAdultAge = state.dateOfBirth
    ? getAge(state.dateOfBirth) >= 18
    : true

  const [hasWarnedEmail, setHasWarnedEmail] = useState<boolean>(false)

  const tldtsRef = useRef<typeof tldts>(undefined)
  useEffect(() => {
    // @ts-expect-error - valid path
    void import('tldts/dist/index.cjs.min.js').then(tldts => {
      tldtsRef.current = tldts
    })
    // This will get used in the avatar creator a few steps later, so lets preload it now
    // @ts-expect-error - valid path
    void import('react-native-view-shot/src/index')
  }, [])

  const onNextPress = () => {
    const emailChanged = prevEmailValueRef.current !== email

    if (!isOverAppMinAccessAge) {
      return
    }

    if (state.serviceDescription?.inviteCodeRequired && !inviteCode) {
      return dispatch({
        type: 'setError',
        value: l`Please enter your invite code.`,
        field: 'invite-code',
      })
    }
    if (!email) {
      return dispatch({
        type: 'setError',
        value: l`Please enter your email.`,
        field: 'email',
      })
    }
    if (!EmailValidator.validate(email)) {
      return dispatch({
        type: 'setError',
        value: l`Your email appears to be invalid.`,
        field: 'email',
      })
    }
    if (emailChanged && tldtsRef.current) {
      if (isEmailMaybeInvalid(email, tldtsRef.current)) {
        prevEmailValueRef.current = email
        setHasWarnedEmail(true)
        return dispatch({
          type: 'setError',
          value: l`Please double-check that you have entered your email address correctly.`,
        })
      }
    } else if (hasWarnedEmail) {
      setHasWarnedEmail(false)
    }
    prevEmailValueRef.current = email
    if (!password) {
      return dispatch({
        type: 'setError',
        value: l`Please choose your password.`,
        field: 'password',
      })
    }
    if (password.length < 8) {
      return dispatch({
        type: 'setError',
        value: l`Your password must be at least 8 characters long.`,
        field: 'password',
      })
    }

    dispatch({type: 'setInviteCode', value: inviteCode})
    dispatch({type: 'setEmail', value: email})
    dispatch({type: 'setPassword', value: password})
    dispatch({type: 'next'})
    ax.metric('signup:nextPressed', {
      activeStep: state.activeStep,
    })
  }

  const showForm = !state.isLoading && !isLoadingStarterPack

  return (
    <View style={[a.gap_lg]}>
      <AppBar
        showBack
        onBack={onPressBack}
        onHelp={() => openLink(FEEDBACK_FORM_URL({email: state.email}))}
      />

      <Eyebrow step={1} total={7} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Get started</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Enter your details to create an account.</Trans>
        </Text>
      </View>

      <FormError error={state.errorField ? undefined : state.error} />

      <HostingProvider
        minimal
        serviceUrl={state.serviceUrl}
        onSelectServiceUrl={v => dispatch({type: 'setServiceUrl', value: v})}
      />

      {!showForm ? (
        <View style={[a.align_center]}>
          <Loader size="xl" />
        </View>
      ) : state.serviceDescription ? (
        <>
          <View style={[a.gap_md]}>
            {state.serviceDescription.inviteCodeRequired && (
              <InputGroup
                testID="inviteCodeInput"
                position="single"
                label={l`Invite code`}
                icon={Ticket}
                value={inviteCode}
                placeholder={l`Required for this provider`}
                onChangeText={value => {
                  const next = value.trim()
                  setInviteCode(next)
                  if (state.errorField === 'invite-code' && next.length > 0) {
                    dispatch({type: 'clearError'})
                  }
                }}
                errorText={
                  state.errorField === 'invite-code' ? state.error : undefined
                }
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={native(() => emailInputRef.current?.focus())}
              />
            )}

            <View>
              <InputGroup
                testID="emailInput"
                ref={emailInputRef}
                position="top"
                label={l`Email`}
                icon={Envelope}
                value={email}
                placeholder={l`Enter your email address`}
                onChangeText={value => {
                  const next = value.trim()
                  setEmail(next)
                  if (hasWarnedEmail) {
                    setHasWarnedEmail(false)
                  }
                  if (
                    state.errorField === 'email' &&
                    next.length > 0 &&
                    EmailValidator.validate(next)
                  ) {
                    dispatch({type: 'clearError'})
                  }
                }}
                errorText={
                  state.errorField === 'email' ? state.error : undefined
                }
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={native(() =>
                  passwordInputRef.current?.focus(),
                )}
              />
              <InputGroup
                testID="passwordInput"
                ref={passwordInputRef}
                position="middle"
                label={l`Password`}
                icon={Lock}
                value={password}
                placeholder={l`Choose your password`}
                onChangeText={value => {
                  setPassword(value)
                  if (state.errorField === 'password' && value.length >= 8) {
                    dispatch({type: 'clearError'})
                  }
                }}
                errorText={
                  state.errorField === 'password' ? state.error : undefined
                }
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={native(() =>
                  birthdateInputRef.current?.focus(),
                )}
              />
              <InputGroup
                testID="dateInput"
                position="bottom"
                label={l`Date of birth`}
                icon={CalendarDays}
                value={i18n.date(state.dateOfBirth, {timeZone: 'UTC'})}
                editable={false}
                onPress={() => birthdateInputRef.current?.focus()}
                onChangeText={() => {}}
              />
            </View>
          </View>

          <View style={{height: 0, overflow: 'hidden'}}>
            <DateField.DateField
              testID="date"
              inputRef={birthdateInputRef}
              value={state.dateOfBirth}
              onChangeDate={date => {
                dispatch({
                  type: 'setDateOfBirth',
                  value: sanitizeDate(new Date(date)),
                })
              }}
              label={l`Date of birth`}
              accessibilityHint={l`Select your date of birth`}
              maximumDate={new Date()}
            />
          </View>

          <View style={[a.gap_sm]}>
            <Policies serviceDescription={state.serviceDescription} />

            {!isOverAppMinAccessAge ? (
              <Admonition.Outer type="error">
                <Admonition.Row>
                  <Admonition.Icon />
                  <Admonition.Content>
                    <Admonition.Text>
                      <Trans>
                        You must be 13 years of age or older to create an
                        account.
                      </Trans>
                    </Admonition.Text>
                  </Admonition.Content>
                </Admonition.Row>
              </Admonition.Outer>
            ) : !isOverMinAdultAge ? (
              <Admonition.Admonition type="warning">
                <Trans>
                  If you are not yet an adult according to the laws of your
                  country, your parent or legal guardian must read these Terms
                  on your behalf.
                </Trans>
              </Admonition.Admonition>
            ) : undefined}
          </View>
        </>
      ) : undefined}

      <PrimaryButton
        testID="nextBtn"
        label={
          isServerError
            ? l`Retry`
            : hasWarnedEmail
              ? l`It's correct`
              : l`Continue`
        }
        onPress={isServerError ? refetchServer : onNextPress}
        disabled={!isServerError && (!isOverAppMinAccessAge || state.isLoading)}
      />
    </View>
  )
}
