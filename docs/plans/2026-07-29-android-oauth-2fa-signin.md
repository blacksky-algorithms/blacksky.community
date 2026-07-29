# Android OAuth 2FA Sign-in Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On Android, stop treating the phantom `openAuthSessionAsync` `dismiss` (fired when the user backgrounds the app to fetch a 2FA code) as a sign-in failure; complete sign-in from the OAuth redirect deep-link instead.

**Architecture:** Add an Android-only helper that drives the OAuth flow with the public `client.authorize()` / `client.callback()` methods and completes when the `community.blacksky:/oauth/callback` deep-link arrives via `Linking` — ignoring the browser promise result entirely. iOS and web keep calling `client.signIn` unchanged. LoginForm gains an Android-only "Finishing sign-in… / Cancel" state (a genuine cancel produces no redirect, so it needs an explicit exit).

**Tech Stack:** React Native / Expo, `@atproto/oauth-client-expo`, `expo-web-browser`, `expo-linking`, Jest (jest-expo).

**Design doc:** `docs/plans/2026-07-29-android-oauth-2fa-signin-design.md`

**Verification note:** The end-to-end bug is Android-runtime-only and cannot be reproduced in Jest or on iOS. Unit tests (Task 1) cover the helper's orchestration logic with mocks; the real fix is confirmed by manual Android testing (Task 3).

---

### Task 1: `signInNativeAndroid` helper (TDD)

**Files:**
- Modify: `src/state/session/oauth-client.ts` (add helper + export `NATIVE_REDIRECT_URI`)
- Create: `__tests__/state/oauth-client-native-signin.test.ts`

**Step 1: Write the failing test**

Create `__tests__/state/oauth-client-native-signin.test.ts`:

```ts
import {signInNativeAndroid} from '#/state/session/oauth-client'

// --- mocks ---
const openAuthSessionAsync = jest.fn().mockResolvedValue({type: 'dismiss'})
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: any[]) => openAuthSessionAsync(...a),
}))

let urlHandler: ((e: {url: string}) => void) | null = null
const removeSub = jest.fn()
jest.mock('expo-linking', () => ({
  addEventListener: (_evt: string, cb: (e: {url: string}) => void) => {
    urlHandler = cb
    return {remove: removeSub}
  },
}))

function makeClient(overrides: Partial<any> = {}) {
  return {
    authorize: jest
      .fn()
      .mockResolvedValue(new URL('https://auth.example/authorize?x=1')),
    callback: jest
      .fn()
      .mockResolvedValue({session: {sub: 'did:plc:abc'}, state: null}),
    ...overrides,
  } as any
}

beforeEach(() => {
  urlHandler = null
  openAuthSessionAsync.mockClear()
  removeSub.mockClear()
})

const REDIRECT = 'community.blacksky:/oauth/callback'

test('completes via redirect deep-link, ignoring the browser dismiss', async () => {
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')

  // let authorize() resolve and the listener register
  await new Promise(r => setImmediate(r))
  expect(openAuthSessionAsync).toHaveBeenCalledTimes(1)
  expect(urlHandler).toBeTruthy()

  // simulate the OAuth redirect
  urlHandler!({url: `${REDIRECT}?code=xyz&state=st`})

  const session = await promise
  expect(session).toEqual({sub: 'did:plc:abc'})
  expect(client.callback).toHaveBeenCalledTimes(1)
  const params = client.callback.mock.calls[0][0] as URLSearchParams
  expect(params.get('code')).toBe('xyz')
  expect(removeSub).toHaveBeenCalled()
})

test('ignores unrelated deep-links', async () => {
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')
  await new Promise(r => setImmediate(r))

  urlHandler!({url: 'community.blacksky:/intent/compose?text=hi'})
  expect(client.callback).not.toHaveBeenCalled()

  urlHandler!({url: `${REDIRECT}?code=ok&state=st`})
  await expect(promise).resolves.toEqual({sub: 'did:plc:abc'})
})

test('rejects and removes the listener when aborted', async () => {
  const client = makeClient()
  const controller = new AbortController()
  const promise = signInNativeAndroid(client, 'alice.test', {
    signal: controller.signal,
  })
  await new Promise(r => setImmediate(r))

  controller.abort()
  await expect(promise).rejects.toThrow('OAUTH_CANCELLED')
  expect(removeSub).toHaveBeenCalled()
  expect(client.callback).not.toHaveBeenCalled()
})

test('surfaces an error redirect (Kind 2) via callback throwing', async () => {
  const client = makeClient({
    callback: jest.fn().mockRejectedValue(new Error('access_denied')),
  })
  const promise = signInNativeAndroid(client, 'alice.test')
  await new Promise(r => setImmediate(r))

  urlHandler!({url: `${REDIRECT}?error=access_denied&state=st`})
  await expect(promise).rejects.toThrow('access_denied')
})
```

**Step 2: Run test to verify it fails**

Run: `yarn jest __tests__/state/oauth-client-native-signin.test.ts`
Expected: FAIL — `signInNativeAndroid is not a function` (not yet exported).

**Step 3: Write minimal implementation**

In `src/state/session/oauth-client.ts`, add the imports at the top (after existing imports):

```ts
import * as Linking from 'expo-linking'
import {openAuthSessionAsync} from 'expo-web-browser'
```

Export the existing redirect constant (change `const NATIVE_REDIRECT_URI` to be exported):

```ts
export const NATIVE_REDIRECT_URI = 'community.blacksky:/oauth/callback'
```

Add at the end of the file:

```ts
/**
 * Android-only OAuth sign-in.
 *
 * `client.signIn` relies on `openAuthSessionAsync`'s result, which on Android is
 * a fragile AppState-based polyfill: returning to the app (e.g. after switching
 * to an email app to fetch a 2FA code) makes it resolve `{type:'dismiss'}` even
 * though the Custom Tab is still open. See the design doc.
 *
 * Instead we drive the flow with the public `authorize()`/`callback()` methods and
 * treat the redirect deep-link (delivered via `Linking`) as the only source of
 * truth. The browser promise result — including the phantom `dismiss` — is ignored.
 *
 * Pass an `AbortSignal` to support user cancellation (a genuine cancel produces no
 * redirect, so the UI must provide one).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo OAuth types do not resolve in Linux CI
export function signInNativeAndroid(
  client: any,
  identifier: string,
  {signal}: {signal?: AbortSignal} = {},
): Promise<any> {
  const redirectUri = NATIVE_REDIRECT_URI
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Expo OAuth types do not resolve in Linux CI */
  return (async () => {
    const url = await client.authorize(identifier, {display: 'touch', signal})

    return await new Promise((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        sub.remove()
        signal?.removeEventListener('abort', onAbort)
      }

      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('OAUTH_CANCELLED'))
      }

      const sub = Linking.addEventListener('url', ({url: incoming}) => {
        if (settled) return
        if (!incoming.startsWith(redirectUri)) return // ignore other deep-links
        settled = true
        cleanup()
        ;(async () => {
          const params = new URL(incoming).searchParams
          const {session} = await client.callback(params, {
            redirect_uri: redirectUri,
          })
          resolve(session)
        })().catch(reject)
      })

      if (signal) {
        if (signal.aborted) return onAbort()
        signal.addEventListener('abort', onAbort)
      }

      // Fire the browser. Its result (incl. Android's phantom `dismiss`) is
      // intentionally ignored — the redirect listener above completes the flow.
      openAuthSessionAsync(url.toString(), redirectUri).catch(() => {})
    })
  })()
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}
```

**Step 4: Run test to verify it passes**

Run: `yarn jest __tests__/state/oauth-client-native-signin.test.ts`
Expected: PASS (4 tests).

**Step 5: Typecheck**

Run: `yarn typecheck` (or `yarn tsc --noEmit` — check `package.json` scripts)
Expected: no new errors in `oauth-client.ts`.

**Step 6: Commit**

```bash
git add src/state/session/oauth-client.ts __tests__/state/oauth-client-native-signin.test.ts
git commit -m "add Android-only OAuth sign-in helper driven by redirect deep-link"
```

---

### Task 2: Wire the helper into LoginForm behind an Android gate

**Files:**
- Modify: `src/screens/Login/LoginForm.tsx`

**Step 1: Add imports + state**

Add to imports:

```ts
import {useRef, useState} from 'react' // already imports useRef/useState — extend if needed
import {signInNativeAndroid, getOAuthClient, NATIVE_REDIRECT_URI} from '#/state/session/oauth-client'
```
(`getOAuthClient` is already imported — just add `signInNativeAndroid` and `NATIVE_REDIRECT_URI`.)

Inside the component (near `const [isProcessing, setIsProcessing] = useState(false)`):

```ts
const [awaitingRedirect, setAwaitingRedirect] = useState(false)
const abortRef = useRef<AbortController | null>(null)
```

**Step 2: Replace the sign-in call (current `LoginForm.tsx:54-98`)**

Replace the `try { ... } catch (e) { ... }` body of `onPressNext` with:

```ts
    setIsProcessing(true)

    const client = getOAuthClient()
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Expo OAuth types do not resolve in Linux CI */
    const doSignIn = (id: string) => {
      if (Platform.OS === 'android') {
        const controller = new AbortController()
        abortRef.current = controller
        setAwaitingRedirect(true)
        return signInNativeAndroid(client, id, {signal: controller.signal})
      }
      return client.signIn(id)
    }

    try {
      let session
      try {
        session = await doSignIn(identifier)
      } catch (e) {
        if (!isHandleResolutionError(e)) throw e
        const did = await resolveDeactivatedHandle(identifier)
        session = await doSignIn(did)
      }
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      if (Platform.OS !== 'web' && session) {
        await login(
          {service: '', identifier: '', password: '', oauthSession: session},
          'LoginForm',
        )
      }
    } catch (e) {
      const errMsg = String(e)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      // User-initiated cancel (Android): silent reset, no error banner.
      if (errMsg.includes('OAUTH_CANCELLED')) {
        // no-op
      } else if (isNetworkError(e)) {
        logger.warn('Failed to start OAuth sign-in due to network error', {error: errMsg})
        setError(
          _(msg`Unable to contact your service. Please check your Internet connection.`),
        )
      } else {
        logger.warn('Failed to start OAuth sign-in', {error: errMsg})
        setError(cleanError(errMsg))
      }
    } finally {
      setIsProcessing(false)
      setAwaitingRedirect(false)
      abortRef.current = null
    }
```

**Step 3: Add the Cancel affordance to the button row (Android, while awaiting)**

In the JSX button row (`LoginForm.tsx:133-158`), change the primary button so that while `awaitingRedirect` it becomes a Cancel action, and add a status line. Replace the primary `<Button ...>Login</Button>` with:

```tsx
        {awaitingRedirect ? (
          <Button
            testID="loginCancelButton"
            label={_(msg`Cancel`)}
            accessibilityHint={_(msg`Cancels the sign-in process`)}
            variant="solid"
            color="secondary"
            size="large"
            onPress={() => abortRef.current?.abort()}>
            <ButtonText>
              <Trans>Cancel</Trans>
            </ButtonText>
          </Button>
        ) : (
          <Button
            testID="loginNextButton"
            label={_(msg`Login`)}
            accessibilityHint={_(msg`Starts the sign-in process`)}
            variant="solid"
            color="primary"
            size="large"
            onPress={onPressNext}>
            <ButtonText>
              <Trans>Login</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}
```

And add a status line above the button row (after `<FormError error={error} />` at `:132`):

```tsx
      {awaitingRedirect && (
        <Text style={[a.text_sm, a.text_center, t.atoms.text_contrast_medium]}>
          <Trans>Finishing sign-in… complete it in your browser, or cancel.</Trans>
        </Text>
      )}
```
Add whatever imports the status line needs (`Text` from `#/components/Typography` and `useTheme`/`t` per this repo's convention — check a sibling component if unsure).

**Step 4: Typecheck + lint**

Run: `yarn typecheck && yarn lint src/screens/Login/LoginForm.tsx`
Expected: no new errors.

**Step 5: Verify iOS path is unchanged**

Confirm by reading the diff: when `Platform.OS !== 'android'`, `doSignIn` calls `client.signIn(id)` exactly as before, `awaitingRedirect` never becomes true, and no `AbortController` is created. iOS/web behavior is identical to pre-change.

**Step 6: Commit**

```bash
git add src/screens/Login/LoginForm.tsx
git commit -m "use Android OAuth helper + add finishing/cancel state to login form"
```

---

### Task 3: Manual verification (Android device/emulator)

**No code — this is the real end-to-end confirmation.**

**Step 1: Build & run on Android**

Run the repo's Android dev build (check `README`/`package.json` — e.g. `yarn android` or the EAS/dev-client flow used here). Confirm the app launches on an emulator or device.

**Step 2: Reproduce the original bug is GONE**

1. Log out / go to the sign-in screen.
2. Enter a handle whose account has **email 2FA** enabled; tap Login.
3. In the Custom Tab, enter the password; reach the "enter email code" step.
4. **Background the app**, open Gmail (or any app), copy the code.
5. Return to the app / Custom Tab, enter the code, submit.
6. ✅ Expected: sign-in **completes** and lands logged-in. No `Authentication cancelled: dismiss`.

**Step 3: Verify Cancel works**

1. Start sign-in again; while the Custom Tab is open, return to the app.
2. ✅ Expected: "Finishing sign-in…" with a **Cancel** button. Tap Cancel → form resets, no error banner, can retry.

**Step 4: Verify error redirect (best-effort)**

If reachable, deny consent on the auth page. ✅ Expected: a real error is shown (not silent).

**Step 5: iOS regression check**

On an iOS build, sign in normally (including 2FA). ✅ Expected: unchanged, still works.

**Step 6: Note results**

Record pass/fail for each step in the PR description. Do not claim "fixed" until Step 2 passes on a real Android build (@superpowers:verification-before-completion).

---

## Done criteria

- Task 1 unit tests pass; typecheck clean.
- Task 2 merged behind `Platform.OS === 'android'`; iOS/web diff is a no-op.
- Task 3 Step 2 confirmed on an Android build (the actual bug repro now succeeds).
