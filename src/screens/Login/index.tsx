import React from 'react'
import {KeyboardAvoidingView} from 'react-native'
import {LayoutAnimationConfig} from 'react-native-reanimated'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {logEvent} from '#/lib/statsig/statsig'
import {type SessionAccount, useSession} from '#/state/session'
import {useLoggedOutView} from '#/state/shell/logged-out'
import {LoggedOutLayout} from '#/view/com/util/layouts/LoggedOutLayout'
import {LoginForm} from '#/screens/Login/LoginForm'
import {atoms as a} from '#/alf'
import {ChooseAccountForm} from './ChooseAccountForm'
import {ScreenTransition} from './ScreenTransition'

enum Forms {
  Login,
  ChooseAccount,
}

export const Login = ({onPressBack}: {onPressBack: () => void}) => {
  const {_} = useLingui()

  const {accounts} = useSession()
  const {requestedAccountSwitchTo} = useLoggedOutView()
  const requestedAccount = accounts.find(
    acc => acc.did === requestedAccountSwitchTo,
  )

  const [error, setError] = React.useState<string>('')
  const [initialHandle, setInitialHandle] = React.useState<string>(
    requestedAccount?.handle || '',
  )
  const [currentForm, setCurrentForm] = React.useState<Forms>(
    requestedAccount
      ? Forms.Login
      : accounts.length
        ? Forms.ChooseAccount
        : Forms.Login,
  )

  const onSelectAccount = (account?: SessionAccount) => {
    setInitialHandle(account?.handle || '')
    setCurrentForm(Forms.Login)
  }

  const gotoForm = (form: Forms) => {
    setError('')
    setCurrentForm(form)
  }

  const handlePressBack = () => {
    onPressBack()
    logEvent('signin:backPressed', {failedAttemptsCount: 0})
  }

  let content = null
  let title = ''
  let description = ''

  switch (currentForm) {
    case Forms.Login:
      title = _(msg`Sign in`)
      description = _(msg`Enter your handle to sign in`)
      content = (
        <LoginForm
          error={error}
          initialHandle={initialHandle}
          setError={setError}
          onPressBack={() =>
            accounts.length ? gotoForm(Forms.ChooseAccount) : handlePressBack()
          }
        />
      )
      break
    case Forms.ChooseAccount:
      title = _(msg`Sign in`)
      description = _(msg`Select from an existing account`)
      content = (
        <ChooseAccountForm
          onSelectAccount={onSelectAccount}
          onPressBack={handlePressBack}
        />
      )
      break
  }

  return (
    <KeyboardAvoidingView testID="signIn" behavior="padding" style={a.flex_1}>
      <LoggedOutLayout
        leadin=""
        title={title}
        description={description}
        scrollable>
        <LayoutAnimationConfig skipEntering skipExiting>
          <ScreenTransition key={currentForm}>{content}</ScreenTransition>
        </LayoutAnimationConfig>
      </LoggedOutLayout>
    </KeyboardAvoidingView>
  )
}
