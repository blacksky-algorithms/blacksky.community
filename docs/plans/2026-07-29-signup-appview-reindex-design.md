# Self-heal missing appview index after signup

## Problem

On account creation, the appview sometimes fails to catch the new-account
event and never indexes the account. The user ends up with a working PDS
account whose profile does not resolve on the appview.

A known operational fix: call `com.atproto.identity.updateHandle` with the
user's *current* handle. This is effectively a no-op at the PDS but re-emits a
`#identity` event on the firehose, which the appview indexer then catches,
back-filling the account.

## Goal

Detect this failure automatically in the client right after signup and trigger
the no-op `updateHandle` self-heal, without blocking onboarding and without any
risk of clobbering a user-initiated handle change.

## Design

New helper `verifyAndRepairAccountIndexing(agent, did)` in
`src/state/session/agent.ts`, fired **non-awaited** from
`createAgentAndCreateAccount` alongside the existing fire-and-forget
`setPersonalDetails` / `upsertProfile` block. Onboarding is never blocked.

### Flow

1. **Poll** `agent.getProfile({actor: did})` for the user's own DID.
   Capped backoff: up to 6 attempts, delays `1s, 2s, 4s, 8s, 8s` (~23s window).
   A profile that resolves ⇒ appview indexed it ⇒ done, no repair.
2. **Repair** if still not resolving after the poll: read the **current live
   handle** from `agent.session?.handle` at that moment and call
   `agent.updateHandle({handle})` with it.
3. **Confirm** with a short second poll (3 attempts, `1s, 2s, 4s`). Log the
   outcome either way.

### Detection

Any throw from `getProfile` (XRPC actor-not-found *or* transient network error)
is treated as "not indexed." Over-triggering is harmless: the repair is a
genuine no-op and we confirm afterward.

### Race safety (user changes handle mid-repair)

The repair reads the handle **fresh from `agent.session.handle` at repair
time**, never a value captured at signup. So if the user changed their handle
in the window, we re-emit their *new* handle rather than reverting to the old
one. Two overlapping `updateHandle` writes are serialized by the PDS; a loser
throws and is swallowed. (In practice the window can't overlap — handle
settings are unreachable during onboarding — so this is defense-in-depth.)

### Error handling

Fully swallowed. Best-effort self-heal must never break signup/onboarding.
All paths `logger.info` / `logger.error` only; the helper never throws.

## Testing

Unit-test the helper with a mocked agent:

- Profile resolves on first poll ⇒ no `updateHandle` call.
- Profile 404s through the whole poll ⇒ exactly one `updateHandle`, using the
  current `agent.session.handle`, then a confirm poll.
- `updateHandle` throws ⇒ swallowed, helper resolves without throwing.
- Handle changed before repair ⇒ `updateHandle` called with the *new*
  session handle, not the original.

Delays are injected/overridable so tests run instantly.

## Out of scope (YAGNI)

- No blocking gate before onboarding.
- No persisted retry-on-relaunch.
- No UI surface.
