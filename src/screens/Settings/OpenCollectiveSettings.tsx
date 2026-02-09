import {useReducer} from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {
  useOCInitLinkMutation,
  useOCLinkStatusQuery,
  useOCVerifyEmailMutation,
} from '#/state/queries/open-collective'
import {useSession} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import * as Layout from '#/components/Layout'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'OpenCollectiveSettings'
>

type Stage = 'email_input' | 'verify_email' | 'contribute'

type State = {
  stage: Stage
  email: string
  code: string
  error: string
}

type Action =
  | {type: 'SET_EMAIL'; email: string}
  | {type: 'SET_CODE'; code: string}
  | {type: 'SET_ERROR'; error: string}
  | {type: 'GO_TO_VERIFY'}
  | {type: 'GO_TO_CONTRIBUTE'; email: string}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_EMAIL':
      return {...state, email: action.email, error: ''}
    case 'SET_CODE':
      return {...state, code: action.code, error: ''}
    case 'SET_ERROR':
      return {...state, error: action.error}
    case 'GO_TO_VERIFY':
      return {...state, stage: 'verify_email', error: ''}
    case 'GO_TO_CONTRIBUTE':
      return {...state, stage: 'contribute', email: action.email, error: ''}
    default:
      return state
  }
}

export function OpenCollectiveSettingsScreen({}: Props) {
  const {_} = useLingui()
  const {currentAccount} = useSession()

  const isPdsUser = !!currentAccount?.email && !!currentAccount?.emailConfirmed

  const [state, dispatch] = useReducer(reducer, {
    stage: 'email_input',
    email: currentAccount?.email ?? '',
    code: '',
    error: '',
  })

  const {data: linkStatus, isLoading: isLoadingStatus} = useOCLinkStatusQuery(
    currentAccount?.did,
  )
  const initLinkMutation = useOCInitLinkMutation()
  const verifyEmailMutation = useOCVerifyEmailMutation()

  // If already linked, show contribute stage directly
  const effectiveStage = linkStatus?.linked ? 'contribute' : state.stage
  const linkedEmail = linkStatus?.linked
    ? (linkStatus.email ?? state.email)
    : state.email

  const handleInitLink = async () => {
    dispatch({type: 'SET_ERROR', error: ''})
    try {
      const result = await initLinkMutation.mutateAsync({
        email: state.email,
      })
      if (result.status === 'linked') {
        dispatch({type: 'GO_TO_CONTRIBUTE', email: state.email})
      } else {
        dispatch({type: 'GO_TO_VERIFY'})
      }
    } catch (e: any) {
      dispatch({
        type: 'SET_ERROR',
        error: e?.message ?? _(msg`Something went wrong. Please try again.`),
      })
    }
  }

  const handleVerifyEmail = async () => {
    dispatch({type: 'SET_ERROR', error: ''})
    try {
      await verifyEmailMutation.mutateAsync({
        email: state.email,
        code: state.code,
      })
      dispatch({type: 'GO_TO_CONTRIBUTE', email: state.email})
    } catch (e: any) {
      dispatch({
        type: 'SET_ERROR',
        error: e?.message ?? _(msg`Invalid code. Please check and try again.`),
      })
    }
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Support BlackSky</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          {isLoadingStatus ? (
            <View
              style={[a.flex_1, a.justify_center, a.align_center, a.py_5xl]}>
              <Loader size="xl" />
            </View>
          ) : effectiveStage === 'email_input' ? (
            <EmailInputStage
              email={state.email}
              error={state.error}
              isPdsUser={isPdsUser}
              isPending={initLinkMutation.isPending}
              onChangeEmail={email => dispatch({type: 'SET_EMAIL', email})}
              onSubmit={handleInitLink}
            />
          ) : effectiveStage === 'verify_email' ? (
            <VerifyEmailStage
              email={state.email}
              code={state.code}
              error={state.error}
              isPending={verifyEmailMutation.isPending}
              onChangeCode={code => dispatch({type: 'SET_CODE', code})}
              onSubmit={handleVerifyEmail}
            />
          ) : (
            <ContributeStage email={linkedEmail} />
          )}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

function EmailInputStage({
  email,
  error,
  isPdsUser,
  isPending,
  onChangeEmail,
  onSubmit,
}: {
  email: string
  error: string
  isPdsUser: boolean
  isPending: boolean
  onChangeEmail: (email: string) => void
  onSubmit: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()

  return (
    <View style={[a.px_xl, a.py_lg, a.gap_lg]}>
      <Text style={[a.text_lg, a.font_bold, t.atoms.text]}>
        <Trans>Link your email</Trans>
      </Text>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          Link your email to associate Open Collective contributions with your
          account. Contributors will receive visual recognition.
        </Trans>
      </Text>

      {error ? <Admonition type="error">{error}</Admonition> : null}

      {isPdsUser ? (
        <Admonition type="info">
          <Trans>We'll use your account email to link your contribution.</Trans>
        </Admonition>
      ) : null}

      <View style={[a.gap_md]}>
        <TextField.LabelText>
          <Trans>Email address</Trans>
        </TextField.LabelText>
        <TextField.Root>
          <TextField.Icon icon={EnvelopeIcon} />
          <TextField.Input
            label={_(msg`Email address`)}
            placeholder="you@example.com"
            value={email}
            onChangeText={onChangeEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!isPdsUser && !isPending}
          />
        </TextField.Root>
      </View>

      <Button
        label={_(msg`Continue`)}
        color="primary"
        size="large"
        disabled={!email.includes('@') || isPending}
        onPress={onSubmit}>
        <ButtonText>
          <Trans>Continue</Trans>
        </ButtonText>
        {isPending && <ButtonIcon icon={Loader} />}
      </Button>
    </View>
  )
}

function VerifyEmailStage({
  email,
  code,
  error,
  isPending,
  onChangeCode,
  onSubmit,
}: {
  email: string
  code: string
  error: string
  isPending: boolean
  onChangeCode: (code: string) => void
  onSubmit: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()

  return (
    <View style={[a.px_xl, a.py_lg, a.gap_lg]}>
      <Text style={[a.text_lg, a.font_bold, t.atoms.text]}>
        <Trans>Verify your email</Trans>
      </Text>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          We sent a verification code to {email}. Enter it below to complete
          linking.
        </Trans>
      </Text>

      {error ? <Admonition type="error">{error}</Admonition> : null}

      <View style={[a.gap_md]}>
        <TextField.LabelText>
          <Trans>Verification code</Trans>
        </TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label={_(msg`Verification code`)}
            placeholder="123456"
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            editable={!isPending}
          />
        </TextField.Root>
      </View>

      <Button
        label={_(msg`Verify`)}
        color="primary"
        size="large"
        disabled={code.length < 6 || isPending}
        onPress={onSubmit}>
        <ButtonText>
          <Trans>Verify</Trans>
        </ButtonText>
        {isPending && <ButtonIcon icon={Loader} />}
      </Button>
    </View>
  )
}

function ContributeStage({email}: {email: string}) {
  return (
    <View style={[a.gap_lg]}>
      <View style={[a.px_xl, a.pt_lg]}>
        <Admonition type="tip">
          <Trans>
            Your email is linked. Contributions made with {email} will be
            associated with your account.
          </Trans>
        </Admonition>
      </View>

      <View style={[a.w_full, a.overflow_hidden, {minHeight: '100vh' as any}]}>
        {}
        <iframe
          src="https://opencollective.com/embed/blacksky/donate"
          style={{
            width: '100%',
            minHeight: '100vh',
            border: 'none',
          }}
          title="Open Collective Donate"
        />
      </View>
    </View>
  )
}
