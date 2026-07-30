# Android OAuth 2FA sign-in fix — design

**Date:** 2026-07-29
**Status:** Design approved, pending implementation
**Scope:** Android only. iOS and web unchanged.

## Problem

Signing in on **Android** fails with `Authentication cancelled: dismiss` whenever the user
leaves the app to retrieve their 2FA email code (e.g. switches to Gmail) and returns. The
sign-in appears cancelled before the user ever submits the code.

### Root cause

The Blacksky client signs in via **OAuth in an in-app browser**, not a native 2FA field.
The app collects only a handle; the password + email-code prompts are rendered by the
authorization server inside a Custom Tab opened by `openAuthSessionAsync`.

On Android, Chrome Custom Tabs provide **no native "tab closed" callback**, so
`expo-web-browser` fakes one using `AppState`:

- `node_modules/expo-web-browser/src/WebBrowser.ts:343-352` — when the app returns to
  `active`, it fires the "browser closed" callback.
- `node_modules/expo-web-browser/src/WebBrowser.ts:374-377` — that resolves the result as
  `{ type: 'dismiss' }`.

The false assumption: "app returned to `active`" is treated as "user closed the tab." But
that is exactly what happens when the user backgrounds the app to read the 2FA email and
comes back. The Custom Tab is in fact **still open** (Expo cannot close it on Android — see
the finally-block comment in `@atproto/oauth-client-expo`).

`@atproto/oauth-client-expo/src/expo-oauth-client.native.ts:85-103` reads that phantom
`dismiss` and throws:

```ts
const result = await openAuthSessionAsync(url.toString(), redirectUri, {...})
if (result.type === 'success') { ... return session }
else { throw new Error(`Authentication cancelled: ${result.type}`) }
```

`src/screens/Login/LoginForm.tsx:81-96` catches it and shows the raw string
(`cleanError` has no case for it).

### iOS is immune

iOS uses the native `ASWebAuthenticationSession`, which correctly survives backgrounding and
only resolves on real completion/cancel. No `AppState` polyfill is involved.

## Key facts that make the fix possible

- `authorize()` (`@atproto/oauth-client/dist/oauth-client.d.ts:319`) and `callback()` (`:325`)
  are **public** on the OAuth client.
- The redirect is a **custom URI scheme** — `community.blacksky:/oauth/callback`
  (`src/state/session/oauth-client.ts:10,67`) — delivered to the app via `Linking`
  regardless of what the browser promise did.
- Web uses a **separate** client + https redirect (`src/state/session/oauth-client.web.ts:179`),
  so this change cannot affect web login.

There are two ways to learn the OAuth flow finished: (a) the browser promise resolving
(fragile on Android), or (b) the redirect deep-link arriving (reliable). `signIn` only uses
(a). The fix uses (b) on Android.

## Design

### 1. Drive the flow manually on Android (source of truth = redirect)

Instead of `client.signIn`, a new Android-only helper:

```
1. url = await client.authorize(identifier, { display: 'touch' })
2. register a Linking listener for community.blacksky:/oauth/callback
3. openAuthSessionAsync(url, redirectUri, { showInRecents: true })   // fire it; IGNORE the result (dismiss included)
4. on redirect: const { session } = await client.callback(params)
5. return session   // LoginForm then calls login(...)
```

### Device-testing findings (2026-07-30, Android emulator)

On-device testing surfaced two Android-specific issues that unit tests could not:

1. **`dismissBrowser()` crash.** An early revision called `dismissBrowser().catch(...)` to
   close the lingering tab. On Android the expo-web-browser native module does **not** implement
   `dismissBrowser`, so it returns `undefined` and `.catch` threw
   `Cannot read property 'catch' of undefined`. Custom Tabs cannot be dismissed programmatically
   on Android anyway, so the call was removed entirely (this helper is Android-only). The test's
   `expo-web-browser` mock intentionally omits `dismissBrowser` so the code can never call it again.

2. **Tab destroyed on app-switch → `showInRecents: true`.** By default Expo launches the Custom
   Tab with `FLAG_ACTIVITY_NO_HISTORY` + `FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS`
   (`WebBrowserModule.kt`, gated on `showInRecents` which defaults to `false`). This means leaving
   the tab to fetch a 2FA code from an email app **destroys** it, and it never reappears in the
   recents switcher — the user can never get back to enter the code. Passing
   `{ showInRecents: true }` to `openAuthSessionAsync` drops those flags so the tab survives
   backgrounding and stays in recents. This is what makes the "leave for the code, then return"
   flow actually usable; it is as essential as ignoring the phantom `dismiss`. iOS ignores the
   option.

The phantom `dismiss` is never read, so it cannot fail the flow. `callback` is only ever
called from the redirect listener — so there is exactly one code exchange (no double-exchange
race).

### 2. Android-only gate

```ts
const doSignIn =
  Platform.OS === 'android'
    ? signInNativeAndroid                    // new helper
    : (id: string) => client.signIn(id)      // iOS + web: UNCHANGED

try { session = await doSignIn(identifier) }
catch (e) {
  if (!isHandleResolutionError(e)) throw e
  session = await doSignIn(await resolveDeactivatedHandle(identifier))
}
```

The existing handle-resolution retry wraps the helper identically. The iOS/web path is
byte-for-byte the current behavior — zero regression surface.

### 3. Waiting UI + Cancel (Android only)

Because a genuine cancel produces **no** redirect (identical to a wrong password), the app
needs one explicit "give up" signal. After kicking off sign-in, LoginForm shows
**"Finishing sign-in… [Cancel]"**.

- **Success** → `login()` flips the session; the logged-out view unmounts; the UI goes away
  on its own.
- **Cancel** → abort the helper (remove the `Linking` listener, reject the promise), reset
  the form.

This state exists only on Android; iOS relies on the native auth sheet's own cancel.

### 4. Error handling

| Situation | Redirect? | Result |
|---|---|---|
| Wrong password / wrong 2FA code | none | user retries in the tab; app keeps waiting |
| Backgrounding to Gmail (the bug) | none yet | `dismiss` ignored; app keeps waiting |
| User denies consent / server rejects | `?error=...` | `callback()` throws → LoginForm shows the real error |
| User genuinely bails | none | user taps **Cancel** |

`callback()` validates and deletes the stored `state` on every call (replay protection), so
both the success and error redirects clean up correctly
(`@atproto/oauth-client/dist/oauth-client.js` — `callback`).

## Files touched

- `src/state/session/oauth-client.ts` — add `signInNativeAndroid` helper.
- `src/screens/Login/LoginForm.tsx` — `Platform.OS === 'android'` gate + Android-only
  waiting/Cancel UI + error catch.

No `node_modules` patches. No upstream/Expo changes. iOS and web untouched.

## Out of scope (YAGNI)

- **Cold-start recovery:** if the OS kills the app while backgrounded mid-flow, the redirect
  is lost. Today's code does not survive this either, so it is not a regression. If needed
  later, move the callback completion into the global deep-link handler
  (`src/lib/hooks/useIntentHandler.ts`).

## Verification

Android-runtime only — cannot be unit-tested or reproduced on iOS.

1. Build to an Android emulator/device.
2. Start sign-in, enter handle, reach the 2FA prompt in the Custom Tab.
3. Background the app (switch to Gmail), return, enter the code, submit.
4. Confirm sign-in completes (no `Authentication cancelled: dismiss`).
5. Confirm **Cancel** aborts cleanly from the waiting state.
6. iOS regression check: sign-in still works unchanged.

## Open risk to validate early

Confirm the app's own `Linking` listener reliably receives
`community.blacksky:/oauth/callback` on Android (high confidence — Expo's own code uses
`Linking` for the same redirect). iOS is untouched, so no iOS delivery concern.
