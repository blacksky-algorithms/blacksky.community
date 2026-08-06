import * as Linking from 'expo-linking'
import {openAuthSessionAsync} from 'expo-web-browser'
import {ExpoOAuthClient} from '@atproto/oauth-client-expo'

import {logger} from '#/logger'
import {
  categorizeOauthError,
  emitOauthTelemetry,
} from '#/state/session/oauth-telemetry'
import {OAUTH_BASE_URL, OAUTH_CLIENT_NAME, OAUTH_SCOPE} from './oauth-config'

export const NATIVE_REDIRECT_URI = 'community.blacksky:/oauth/callback'

// The redirect deep-link can arrive with either a single (`:/oauth`) or double
// (`://oauth`) slash depending on the Android/Hermes deep-link path, so match
// both forms rather than relying on `startsWith(NATIVE_REDIRECT_URI)`.
const OAUTH_CALLBACK_RE = /^community\.blacksky:\/\/?oauth\/callback\b/

export function isOAuthCallbackUrl(url: string): boolean {
  return OAUTH_CALLBACK_RE.test(url)
}

// Exchanging a redirect consumes its one-time `state` entry from the OAuth
// client's store, so exactly one handler may act on a given URL. Two are armed
// whenever the app is alive: the in-flight `signInNativeAndroid` listener, and
// the cold-start recovery in `useNativeOAuthRedirect`. Both claim here first;
// the loser backs off instead of calling `callback()` on spent state.
const claimedRedirects = new Set<string>()

export function claimOAuthRedirect(url: string): boolean {
  if (claimedRedirects.has(url)) return false
  claimedRedirects.add(url)
  return true
}

/**
 * Exchange an OAuth redirect deep-link for a session.
 *
 * Slash-count-agnostic param extraction — do NOT rely on `new URL()`, which is
 * fragile on Hermes for the custom `community.blacksky:` scheme.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo OAuth types do not resolve in Linux CI */
export async function completeOAuthRedirect(client: any, url: string) {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- ditto */
  const {session} = await client.callback(params, {
    redirect_uri: NATIVE_REDIRECT_URI,
  })

  return session
}

// Debug fetch wrapper — logs all OAuth-related network requests to Metro console
const debugFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  const method = init?.method?.toUpperCase() ?? 'GET'
  console.log(`[OAuth fetch] ${method} ${url}`)
  try {
    const res = await fetch(input, init)
    const cloned = res.clone()
    let body: string | undefined
    try {
      body = await cloned.text()
    } catch {}
    console.log(`[OAuth fetch] ${res.status} ${url}`, body?.slice(0, 500))
    return res
  } catch (err) {
    console.error(`[OAuth fetch] FAILED ${url}`, err)
    throw err
  }
}

// Session lifecycle hooks. Mirrors the web client at parity so production
// debugging surfaces the same telemetry events on both platforms. The OAuth
// client base class invokes onUpdate after each refresh and onDelete when a
// session is invalidated (refresh/revocation/expiry).
const sessionHooks = {
  onDelete(sub: string, cause: unknown) {
    const category = categorizeOauthError(cause)
    const message =
      cause instanceof Error
        ? cause.message
        : typeof cause === 'string'
          ? cause
          : undefined
    logger.warn('oauth: session deleted', {sub, cause: category, message})
    emitOauthTelemetry({
      type: 'oauth:sessionDeleted',
      payload: {cause: category, message: message?.slice(0, 200)},
    })
  },
  onUpdate(_sub: string) {
    emitOauthTelemetry({type: 'oauth:sessionRefreshed', payload: {}})
  },
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- package constructor type does not resolve in Linux CI
const BSKY_OAUTH_CLIENT = new ExpoOAuthClient({
  clientMetadata: {
    client_id: `${OAUTH_BASE_URL}/oauth-client-metadata-native.json`,
    client_name: OAUTH_CLIENT_NAME,
    client_uri: OAUTH_BASE_URL,
    redirect_uris: [NATIVE_REDIRECT_URI],
    scope: OAUTH_SCOPE,
    token_endpoint_auth_method: 'none',
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    application_type: 'native',
    dpop_bound_access_tokens: true,
  },
  handleResolver: 'https://blacksky.app',
  fetch: debugFetch,
  ...sessionHooks,
})

export function getOAuthClient() {
  return BSKY_OAUTH_CLIENT
}

/**
 * Android-only OAuth sign-in.
 *
 * `client.signIn` relies on `openAuthSessionAsync`'s result, which on Android is
 * a fragile AppState-based polyfill: returning to the app (e.g. after switching
 * to an email app to fetch a 2FA code) makes it resolve `{type:'dismiss'}` even
 * though the Custom Tab is still open. See docs/plans/2026-07-29-android-oauth-2fa-signin-design.md.
 *
 * Instead we drive the flow with the public `authorize()`/`callback()` methods and
 * treat the redirect deep-link (delivered via `Linking`) as the only source of
 * truth. The browser promise result — including the phantom `dismiss` — is ignored.
 *
 * Pass an `AbortSignal` to support user cancellation (a genuine cancel produces no
 * redirect, so the UI must provide one).
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Expo OAuth types do not resolve in Linux CI */
export async function signInNativeAndroid(
  client: any,
  identifier: string,
  {signal}: {signal?: AbortSignal} = {},
): Promise<any> {
  const redirectUri = NATIVE_REDIRECT_URI

  let url
  try {
    url = await client.authorize(identifier, {display: 'touch', signal})
  } catch (e) {
    // An abort during authorize() rejects with a DOMException `AbortError`;
    // normalize it so the UI's cancel branch recognizes it like every other path.
    if (signal?.aborted) throw new Error('OAUTH_CANCELLED')
    throw e
  }

  return await new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      sub.remove()
      signal?.removeEventListener('abort', onAbort)
      // NOTE: we deliberately do NOT call dismissBrowser() here. It is not
      // implemented by the expo-web-browser Android native module (returns
      // undefined), so calling it throws; and Custom Tabs cannot be dismissed
      // programmatically on Android anyway. This helper is Android-only.
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('OAUTH_CANCELLED'))
    }

    const sub = Linking.addEventListener('url', ({url: incoming}) => {
      if (settled) return
      if (!isOAuthCallbackUrl(incoming)) return // ignore other deep-links
      // Claimed synchronously so the cold-start handler, which can only run a
      // tick later off a React effect, stands down for this URL.
      if (!claimOAuthRedirect(incoming)) return
      settled = true
      cleanup()
      ;(async () => {
        resolve(await completeOAuthRedirect(client, incoming))
      })().catch(reject)
    })

    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort)
    }

    // Fire the browser. Its RESULT (incl. Android's phantom `dismiss`) is
    // intentionally ignored — the redirect listener above completes the flow.
    // A genuine launch REJECTION, however, must surface, or the promise would
    // hang forever with no redirect ever arriving.
    //
    // `showInRecents: true` is critical for the 2FA flow. By default Expo
    // launches the Custom Tab with FLAG_ACTIVITY_NO_HISTORY + EXCLUDE_FROM_RECENTS,
    // so leaving the tab (e.g. to fetch a 2FA code from an email app) DESTROYS it
    // and it never reappears in the recents switcher — the user can never get back
    // to enter the code. showInRecents keeps the tab alive and in recents so they
    // can return to it. iOS ignores this option.
    openAuthSessionAsync(url.toString(), redirectUri, {
      showInRecents: true,
    }).catch(err => {
      if (settled) return
      settled = true
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}
