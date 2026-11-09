# @atproto/oauth-client stale-instance DPoP guard

`OAuthSession` keeps its DPoP key in memory but re-reads the token set from the shared session
store (IndexedDB on web, keyed by DID) on every request. Logging in again for the same DID
replaces the stored token set and key. Any session object that is still alive from before that
login (a second tab or window, or a leftover agent in the same tab) then signs the new token with
its old key. The PDS answers 401 `invalid_token` ("DPoP key does not match the token binding").

Upstream `fetchHandler` treats that 401 as an expired token: it forces a refresh (which succeeds,
because the refresh token in the store is valid), retries with the old key, gets 401 again, and
calls `delStored`, deleting the shared session. The tab the user is actually using is then logged
out with "The session was deleted by another process". Each re-login repeats the loop.

This patch adds `ownsStoredSession()`, which compares the instance's key with the key currently in
the store. When they differ, `fetchHandler` returns the 401 without refreshing or deleting. When
nothing is stored, or the keys match, behavior is unchanged.

Applies to 0.6.1, which both `@atproto/oauth-client-browser@0.3.42` (web) and
`@atproto/oauth-client-expo` (native) resolve to. The bug only shows on web; native runs one
instance per app process, so the guard is a no-op there. Drop the patch once upstream ships an
equivalent guard.
