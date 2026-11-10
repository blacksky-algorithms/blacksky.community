import {type SignupState} from '#/screens/Signup/state'

export type CaptchaWebViewProps = {
  url: string
  /**
   * Optional URL to load if `url` fails (e.g. the attestation endpoint 404s on
   * a PDS that hasn't been updated). Lets us try attestation first and fall
   * back to the standard captcha without ever breaking account creation.
   */
  fallbackUrl?: string
  stateParam: string
  state?: SignupState
  onFallback?: (statusCode?: number) => void
  onComplete: () => void
  onSuccess: (code: string) => void
  onError: (error: unknown) => void
}
