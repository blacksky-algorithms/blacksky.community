import {useEffect} from 'react'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {logger} from '#/logger'
import {useSessionApi} from '#/state/session'
import {getOAuthClient} from '#/state/session/oauth-client'
import * as Toast from '#/components/Toast'
import {getHomeNavigationAction} from '#/lib/routes/navigation'

export function AuthCallback() {
  const {_} = useLingui()
  const {login} = useSessionApi()
  const navigation = useNavigation<NavigationProp>()

  useEffect(() => {
    void (async () => {
      try {
        const client = getOAuthClient()
        const session = await client.handleCallback()
        if (session) {
          await login(
            {
              service: '',
              identifier: '',
              password: '',
              oauthSession: session,
            },
            'LoginForm',
          )
        }
        navigation.dispatch(
          getHomeNavigationAction(navigation.getState(), 'replace'),
        )
      } catch (e) {
        logger.error('OAuth callback failed', {
          error: e instanceof Error ? e.message : String(e),
        })
        Toast.show(_(msg`Sign-in failed. Please try again.`), {type: 'error'})
        navigation.dispatch(
          getHomeNavigationAction(navigation.getState(), 'replace'),
        )
      }
    })()
  }, [_, login, navigation])

  return null
}
