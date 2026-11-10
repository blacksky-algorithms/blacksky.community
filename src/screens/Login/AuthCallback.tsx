import {useEffect} from 'react'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {logger} from '#/logger'
import {useSessionApi} from '#/state/session'
import {getOAuthClient} from '#/state/session/oauth-client'
import * as Toast from '#/components/Toast'

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
        navigation.replace('Home')
      } catch (e) {
        logger.error('OAuth callback failed', {
          error: e instanceof Error ? e.message : String(e),
        })
        Toast.show(_(msg`Sign-in failed. Please try again.`), {type: 'error'})
        navigation.replace('Home')
      }
    })()
  }, [_, login, navigation])

  return null
}
