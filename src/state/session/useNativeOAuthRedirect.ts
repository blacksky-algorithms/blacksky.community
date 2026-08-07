import {useEffect} from 'react'
import * as Linking from 'expo-linking'

import {logger} from '#/logger'
import {useSessionApi} from '#/state/session'
import {
  claimOAuthRedirect,
  completeOAuthRedirect,
  getOAuthClient,
  isOAuthCallbackUrl,
} from '#/state/session/oauth-client'

/**
 * Completes a native OAuth sign-in whose redirect arrived without an in-flight
 * `signInNativeAndroid` waiting for it.
 *
 * The sign-in helper listens for the redirect with `Linking.addEventListener`,
 * which only ever sees URLs delivered to a *running* app. That is enough while
 * the app stays alive, but the 2FA flow forces the user out to an email app to
 * fetch a code, and Android is free to kill our backgrounded process while they
 * are gone. The redirect then cold-starts the app, where the listener does not
 * exist yet and the launch URL is only reachable via the initial-URL APIs — so
 * the callback landed nowhere and the user was dropped on the logged-out screen
 * with their sign-in silently abandoned.
 *
 * `useLinkingURL()` reports the launch URL as well as later ones, so mounting
 * this recovers those sign-ins. The authorization state that `callback()` needs
 * outlives the process: @atproto/oauth-client-expo keeps it in MMKV for ten
 * minutes.
 *
 * That MMKV TTL is not the real deadline, though. The PDS expires the
 * authorization request after AUTHORIZATION_INACTIVITY_TIMEOUT — five minutes —
 * refreshed only by requests to the authorization server, which a browser tab
 * parked on the 2FA form does not make. A detour longer than five minutes comes
 * back as `error=access_denied` no matter what the client does, so recovery here
 * cannot be complete on its own.
 */
export function useNativeOAuthRedirect() {
  const incomingUrl = Linking.useLinkingURL()
  const {login} = useSessionApi()

  useEffect(() => {
    if (!incomingUrl || !isOAuthCallbackUrl(incomingUrl)) return
    // A live signInNativeAndroid claims the URL first and completes it itself;
    // the exchange is single-use, so only one of us may run it.
    if (!claimOAuthRedirect(incomingUrl)) return

    logger.warn('oauth: completing native redirect outside of sign-in flow')
    void (async () => {
      try {
        const session = await completeOAuthRedirect(
          getOAuthClient(),
          incomingUrl,
        )
        await login(
          {service: '', identifier: '', password: '', oauthSession: session},
          'LoginForm',
        )
      } catch (e) {
        // Most likely the ten-minute authorization window elapsed while the
        // user was away, which cannot be recovered without a fresh sign-in.
        logger.error('oauth: native redirect recovery failed', {
          error: String(e),
        })
      }
    })()
  }, [incomingUrl, login])
}
