import {useEffect, useMemo, useRef, useState} from 'react'
import {WebView, type WebViewNavigation} from 'react-native-webview'
import {type ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes'

import {logger} from '#/logger'
import {type SignupState} from '#/screens/Signup/state'

const ALLOWED_HOSTS = [
  'bsky.social',
  'bsky.app',
  'blacksky.app',
  'blacksky.community',
  'staging.bsky.app',
  'staging.bsky.dev',
  'js.hcaptcha.com',
  'newassets.hcaptcha.com',
  'api2.hcaptcha.com',
]

const MIN_DELAY = 3_500

/** True if the two URLs point at the same host + path (query ignored). */
function isSameEndpoint(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.host === ub.host && ua.pathname === ub.pathname
  } catch {
    return false
  }
}

export function CaptchaWebView({
  url,
  fallbackUrl,
  stateParam,
  state,
  onComplete,
  onSuccess,
  onError,
}: {
  url: string
  /**
   * Optional URL to load if `url` fails (e.g. the attestation endpoint 404s on
   * a PDS that hasn't been updated). Lets us try attestation first and fall
   * back to the standard captcha without ever breaking account creation.
   */
  fallbackUrl?: string
  stateParam: string
  state?: SignupState
  onComplete: () => void
  onSuccess: (code: string) => void
  onError: (error: unknown) => void
}) {
  const startedAt = useRef(Date.now())
  const successTo = useRef<NodeJS.Timeout>(undefined)

  // The URL currently loaded in the WebView. Starts at `url` and switches to
  // `fallbackUrl` once if the primary endpoint fails to load. Callers should
  // key this component on `url` so a changed primary URL remounts and resets
  // both this state and `usedFallback`.
  const [uri, setUri] = useState(url)
  const usedFallback = useRef(false)

  useEffect(() => {
    return () => {
      if (successTo.current) {
        clearTimeout(successTo.current)
      }
    }
  }, [])

  // Attempt to recover from a failed load of the primary (attestation) URL by
  // silently reloading the fallback (captcha) URL. Returns true if it handled
  // the error, false if the caller should surface it.
  const tryFallback = (failedUrl: string | undefined): boolean => {
    if (
      fallbackUrl &&
      !usedFallback.current &&
      // Only react to the main gate document failing, not subresources.
      (!failedUrl || isSameEndpoint(failedUrl, uri))
    ) {
      logger.warn(
        'Signup captcha: primary gate endpoint failed, falling back to captcha',
      )
      usedFallback.current = true
      setUri(fallbackUrl)
      return true
    }
    return false
  }

  const redirectHost = useMemo(() => {
    if (!state?.serviceUrl) return 'blacksky.community'

    return state?.serviceUrl &&
      new URL(state?.serviceUrl).host === 'staging.bsky.dev'
      ? 'app.staging.bsky.dev'
      : 'blacksky.community'
  }, [state?.serviceUrl])

  const wasSuccessful = useRef(false)

  const onShouldStartLoadWithRequest = (event: ShouldStartLoadRequest) => {
    const urlp = new URL(event.url)
    return ALLOWED_HOSTS.includes(urlp.host)
  }

  const onNavigationStateChange = (e: WebViewNavigation) => {
    if (wasSuccessful.current) return

    const urlp = new URL(e.url)
    // Ignore navigations that are still on a gate page (the captcha or the
    // attestation page). We only act on the final redirect back to the app,
    // which carries the verification code.
    if (urlp.host !== redirectHost || urlp.pathname.startsWith('/gate/signup'))
      return

    const code = urlp.searchParams.get('code')
    if (urlp.searchParams.get('state') !== stateParam || !code) {
      onError({error: 'Invalid state or code'})
      return
    }

    // We want to delay the completion of this screen ever so slightly so that it doesn't appear to be a glitch if it completes too fast
    wasSuccessful.current = true
    onComplete()
    const now = Date.now()
    const timeTaken = now - startedAt.current
    if (timeTaken < MIN_DELAY) {
      successTo.current = setTimeout(() => {
        onSuccess(code)
      }, MIN_DELAY - timeTaken)
    } else {
      onSuccess(code)
    }
  }

  return (
    <WebView
      source={{uri}}
      javaScriptEnabled
      style={{
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 10,
      }}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onNavigationStateChange={onNavigationStateChange}
      scrollEnabled={false}
      onError={e => {
        if (tryFallback(e.nativeEvent.url)) return
        onError(e.nativeEvent)
      }}
      onHttpError={e => {
        if (tryFallback(e.nativeEvent.url)) return
        onError(e.nativeEvent)
      }}
    />
  )
}
