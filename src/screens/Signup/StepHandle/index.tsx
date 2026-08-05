import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {
  createFullHandle,
  MAX_SERVICE_HANDLE_LENGTH,
  validateServiceHandle,
} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {
  checkHandleAvailability,
  useHandleAvailabilityQuery,
} from '#/state/queries/handle-availability'
import {Logomark} from '#/view/icons/Logomark'
import {useSignupContext} from '#/screens/Signup/state'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useThrottledValue} from '#/components/hooks/useThrottledValue'
import {At_Stroke2_Corner0_Rounded as At} from '#/components/icons/At'
import {Check_Stroke2_Corner0_Rounded as Check} from '#/components/icons/Check'
import {
  AppBar,
  Eyebrow,
  InputGroup,
  PrimaryButton,
  SelectionRow,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {HandleSuggestions} from './HandleSuggestions'

export function StepHandle({
  onPressSignIn,
}: {
  onPressSignIn?: (handle: string) => void
}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const t = useTheme()
  const openLink = useOpenLink()
  const {state, dispatch} = useSignupContext()
  const [draftValue, setDraftValue] = useState(state.handle)
  const [submitFoundTaken, setSubmitFoundTaken] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState(
    state.userDomain ||
      state.serviceDescription?.availableUserDomains?.[0] ||
      '',
  )
  const isNextLoading = useThrottledValue(state.isLoading, 500)

  const availableDomains = useMemo(
    () => state.serviceDescription?.availableUserDomains || [],
    [state.serviceDescription?.availableUserDomains],
  )

  const validCheck = validateServiceHandle(draftValue, selectedDomain)

  const {
    debouncedUsername: debouncedDraftValue,
    enabled: queryEnabled,
    query: {data: isHandleAvailable, isPending},
  } = useHandleAvailabilityQuery({
    username: draftValue,
    serviceDid: state.serviceDescription?.did ?? 'UNKNOWN',
    serviceDomain: selectedDomain,
    birthDate: state.dateOfBirth.toISOString(),
    email: state.email,
    enabled: validCheck.overall,
  })

  const hasDebounceSettled = draftValue === debouncedDraftValue
  const isHandleTaken =
    !isPending &&
    queryEnabled &&
    isHandleAvailable &&
    !isHandleAvailable.available
  const isNotReady = isPending || !hasDebounceSettled
  const isNextDisabled =
    !validCheck.overall || !!state.error || isNotReady ? true : isHandleTaken

  const showSignInInstead =
    !!onPressSignIn &&
    draftValue.length > 0 &&
    ((isHandleTaken && hasDebounceSettled) || submitFoundTaken)
  const trimmedDraft = draftValue.trim()
  const fullDraftHandle = createFullHandle(trimmedDraft, selectedDomain)

  const errorText = useMemo(() => {
    if (state.error) {
      return state.error
    }
    if (isHandleTaken && validCheck.overall) {
      return _(msg`${fullDraftHandle} is not available`)
    }
    if (draftValue.length === 0) {
      return undefined
    }
    if (!validCheck.hyphenStartOrEnd) {
      return _(msg`Username cannot begin or end with a hyphen`)
    }
    if (!validCheck.handleChars) {
      return _(
        msg`Username must only contain letters (a-z), numbers, and hyphens`,
      )
    }
    if (!validCheck.totalLength || !validCheck.frontLengthNotTooLong) {
      if (
        !validCheck.totalLength ||
        draftValue.length > MAX_SERVICE_HANDLE_LENGTH
      ) {
        return _(
          msg`Username cannot be longer than ${MAX_SERVICE_HANDLE_LENGTH} characters`,
        )
      }
      return _(msg`Username must be at least 3 characters`)
    }
    return undefined
  }, [state.error, isHandleTaken, validCheck, draftValue, fullDraftHandle, _])

  const supportingText =
    trimmedDraft.length > 0
      ? _(msg`Your username: @${fullDraftHandle}`)
      : undefined

  const onNextPress = async () => {
    const handle = draftValue.trim()

    dispatch({
      type: 'setHandle',
      value: handle,
    })
    dispatch({
      type: 'setUserDomain',
      value: selectedDomain,
    })

    if (!validCheck.overall) {
      return
    }

    dispatch({type: 'setIsLoading', value: true})

    try {
      const {available: handleAvailable} = await checkHandleAvailability(
        createFullHandle(handle, selectedDomain),
        state.serviceDescription?.did ?? 'UNKNOWN',
        {},
      )

      if (!handleAvailable) {
        setSubmitFoundTaken(true)
        dispatch({
          type: 'setError',
          value: _(msg`That handle is already taken.`),
          field: 'handle',
        })
        return
      }
    } catch (error) {
      logger.error('Failed to check handle availability on next press', {
        safeMessage: error,
      })
    } finally {
      dispatch({type: 'setIsLoading', value: false})
    }

    ax.metric('signup:nextPressed', {
      activeStep: state.activeStep,
      phoneVerificationRequired:
        state.serviceDescription?.phoneVerificationRequired,
    })

    if (!state.serviceDescription?.phoneVerificationRequired) {
      dispatch({
        type: 'submit',
        task: {verificationCode: undefined, mutableProcessed: false},
      })
      return
    }
    dispatch({type: 'next'})
  }

  const onBackPress = () => {
    const handle = draftValue.trim()
    dispatch({
      type: 'setHandle',
      value: handle,
    })
    dispatch({
      type: 'setUserDomain',
      value: selectedDomain,
    })
    dispatch({type: 'prev'})
    ax.metric('signup:backPressed', {activeStep: state.activeStep})
  }

  const onSelectDomain = (domain: string) => {
    setSubmitFoundTaken(false)
    if (state.error) {
      dispatch({type: 'setError', value: ''})
    }
    setSelectedDomain(domain)
  }

  return (
    <View style={[a.gap_lg]}>
      <AppBar
        showBack
        onBack={onBackPress}
        onHelp={() => openLink(FEEDBACK_FORM_URL({email: state.email}))}
      />

      <Eyebrow step={2} total={7} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Create your profile</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Choose how you show up in the community.</Trans>
        </Text>
      </View>

      <InputGroup
        testID="handleInput"
        position="single"
        label={_(msg`Handle`)}
        icon={At}
        value={draftValue}
        placeholder={_(msg`Enter your handle`)}
        onChangeText={val => {
          if (state.error) {
            dispatch({type: 'setError', value: ''})
          }
          setSubmitFoundTaken(false)
          setDraftValue(val.toLowerCase())
        }}
        supportingText={supportingText}
        errorText={errorText}
        trailing={
          isHandleAvailable?.available && draftValue.length > 0 ? (
            <Check size="md" style={{color: t.palette.positive_600}} />
          ) : undefined
        }
        keyboardType="ascii-capable"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        autoComplete="off"
      />

      {availableDomains.length > 0 && (
        <View style={[a.gap_xs]}>
          <View>
            {availableDomains.map(domain => (
              <SelectionRow
                key={domain}
                testID={`domainOption-${domain}`}
                mode="radio"
                selected={selectedDomain === domain}
                onPress={() => onSelectDomain(domain)}
                title={domain}
                subtitle={domainSubtitle(domain, _)}
                icon={<Logomark width={24} fill={t.palette.primary_500} />}
              />
            ))}
          </View>
          <Text
            style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
            <Trans>
              Blacksky.app is reserved for Black folks building communal
              infrastructure. Learn more.
            </Trans>
          </Text>
        </View>
      )}

      {isHandleTaken &&
        validCheck.overall &&
        isHandleAvailable?.suggestions &&
        isHandleAvailable.suggestions.length > 0 && (
          <HandleSuggestions
            suggestions={isHandleAvailable.suggestions}
            onSelect={suggestion => {
              const handlePart = suggestion.handle.includes('.')
                ? suggestion.handle.split('.')[0]
                : suggestion.handle.slice(0, selectedDomain.length * -1)
              setDraftValue(handlePart)
              ax.metric('signup:handleSuggestionSelected', {
                method: suggestion.method,
              })
            }}
          />
        )}

      {showSignInInstead && (
        <View style={[a.align_start]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>Is this your account?</Trans>
          </Text>
          <Button
            testID="signInInsteadButton"
            label={_(msg`Sign in instead`)}
            variant="ghost"
            color="primary"
            size="small"
            style={[a.mt_xs]}
            onPress={() => onPressSignIn?.(fullDraftHandle)}>
            <ButtonText>
              <Trans>Sign in as {fullDraftHandle}</Trans>
            </ButtonText>
          </Button>
        </View>
      )}

      <PrimaryButton
        testID="nextBtn"
        label={_(msg`Continue`)}
        onPress={onNextPress}
        disabled={isNextDisabled || isNextLoading}
      />
    </View>
  )
}

function domainSubtitle(domain: string, _: ReturnType<typeof useLingui>['_']) {
  const key = domain.replace(/^\./, '')
  switch (key) {
    case 'blacksky.app':
      return _(msg`Reserved for Black folks`)
    case 'myatproto.social':
    case 'cryptoanarchy.network':
    default:
      return _(msg`For all`)
  }
}
