# AppView Backend: OC Email Linking + Verification

## Implementation Plan for `atproto-private/packages/bsky/`

---

## Overview

The client-side OC contribution settings screen (in `blacksky.community`) calls three AppView endpoints to let users link an email address to their DID for Open Collective contribution attribution. The AppView needs to:

1. Store DID ↔ email links in `private_data` so contributions can be attributed to accounts
2. Send verification emails to non-PDS users via Resend
3. Expose three authenticated Express endpoints

### Client API Contract

The client (`blacksky.community/src/state/queries/open-collective.ts`) makes these calls:

| Method | Path | Auth | Request Body | Response |
|--------|------|------|--------------|----------|
| GET | `/api/oc/link-status` | Bearer JWT | — | `{ linked: boolean, email?: string }` |
| POST | `/api/oc/init-link` | Bearer JWT | `{ email: string }` | `{ status: 'linked' \| 'verification_needed' }` |
| POST | `/api/oc/verify-email` | Bearer JWT | `{ email: string, code: string }` | `{ status: 'linked' }` |

> **Note on path prefix**: The client currently uses `/api/oc/*`. Determine whether to mount these under `/api/oc/` or `/external/oc/` based on the AppView's existing routing conventions. If you mount at `/external/oc/`, update the client fetch URLs in `blacksky.community/src/state/queries/open-collective.ts` to match.

---

## Architecture

```
Client                        AppView (Express)              DataPlane (gRPC)         DB
──────                        ─────────────────              ────────────────         ──
GET /link-status   ────────→  auth + handler  ──────────→   getOcEmailLink()  ───→  private_data
POST /init-link    ────────→  auth + handler  ──────────→   stashClient.create() → BSync → private_data
                                │ (non-PDS)
                                └──→ Resend API (send code)
POST /verify-email ────────→  auth + handler  ──────────→   stashClient.create() → BSync → private_data
```

**Storage**: Use existing `private_data` table with namespace `app.bsky.opencollective.defs#emailLink`. Data flows through StashClient → BSync → DataPlane indexing pipeline.

**Reads**: New `GetOcEmailLink` gRPC method on the DataPlane, querying `private_data` filtered by the OC namespace.

**Verification codes**: In-memory `Map` with 10-minute TTL (sufficient for single-instance; upgrade to DB-backed if multi-instance needed later).

**Email**: Resend SDK — single dependency, HTTP-based, no SMTP config.

**No lexicon needed**: Lexicons define schemas for data stored publicly in AT Protocol repos. This data is private server-side storage in `private_data`, so no lexicon definition is required.

---

## Pre-Implementation: Verify StashClient Requirements

Before starting, check how `StashClient` works in the codebase:

```bash
# Find the StashClient implementation
grep -r "class StashClient" --include="*.ts" .

# Check how existing create() calls work — what params are needed?
grep -rn "stashClient.create" --include="*.ts" .

# Check if StashClient validates payloads against lexicon schemas
grep -rn "lexicon\|validate\|schema" <path-to-stash-client-file>
```

**If StashClient requires a lexicon for validation**: You have two options:
1. Add a minimal validation bypass for the OC namespace
2. Write directly to `private_data` via the DB instead of StashClient

**If StashClient just needs a namespace string** (more likely): Proceed with the plan as-is, just adding the namespace to the `Namespaces` enum in `src/stash.ts`.

Also verify the `private_data` table schema:

```bash
# Find the private_data table schema / migration
grep -rn "private_data" --include="*.ts" src/data-plane/
```

Confirm the columns: `actorDid`, `namespace`, `payload` (and any others like `createdAt`, `rkey`).

---

## Step-by-Step Implementation

### Step 1: Add Proto Definition

**File**: `proto/bsky.proto`

Add to the `Service` block (find the section near Bookmarks RPCs):

```protobuf
// Open Collective
rpc GetOcEmailLink(GetOcEmailLinkRequest) returns (GetOcEmailLinkResponse);
```

Add message definitions (find the section near Bookmark messages):

```protobuf
//
// Open Collective
//
message GetOcEmailLinkRequest {
  string actor_did = 1;
}

message GetOcEmailLinkResponse {
  bool linked = 1;
  string email = 2;  // masked, e.g. "u***@example.com"
}
```

Then regenerate:

```bash
yarn buf:gen
```

This updates `src/proto/bsky_pb.ts` and `src/proto/bsky_connect.ts`.

### Step 2: Add Stash Namespace

**File**: `src/stash.ts`

Add to the `Namespaces` object (follow the pattern of existing entries):

```ts
AppBskyOpencollectiveDefsEmailLink: 'app.bsky.opencollective.defs#emailLink',
```

> **Note**: If existing namespace entries use a `satisfies` constraint tied to lexicon types, you'll need to handle this differently since we're not creating a lexicon. Options:
> - Use a type assertion: `as const`
> - Add it as a plain string constant outside the typed `Namespaces` if the type system won't allow it
>
> Check what the existing entries look like and adapt accordingly.

### Step 3: Add DataPlane Route

**File**: `src/data-plane/server/routes/oc.ts` (new)

```ts
import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect'
import { Database } from '../db'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getOcEmailLink(req) {
    const { actorDid } = req

    const row = await db.db
      .selectFrom('private_data')
      .where('actorDid', '=', actorDid)
      .where('namespace', '=', 'app.bsky.opencollective.defs#emailLink')
      .selectAll()
      .executeTakeFirst()

    if (!row) {
      return { linked: false, email: '' }
    }

    const payload = JSON.parse(row.payload)
    const email: string = payload.email ?? ''
    const [local, domain] = email.split('@')
    const masked = local?.[0] + '***@' + (domain ?? '')

    return { linked: true, email: masked }
  },
})
```

> **Adapt column names**: Verify exact column names from the `private_data` table schema. They may use snake_case (`actor_did`) or camelCase (`actorDid`).

**File**: `src/data-plane/server/routes/index.ts` (modify)

Register the OC route following the same pattern as bookmarks:

```ts
import oc from './oc'

// In the route registration section, add:
...oc(db),
```

### Step 4: Add Resend Mailer

**File**: `src/mailer.ts` (new)

```ts
import { Resend } from 'resend'

export class AppViewMailer {
  private resend: Resend

  constructor(apiKey: string, private fromAddress: string) {
    this.resend = new Resend(apiKey)
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.resend.emails.send({
      from: this.fromAddress,
      to: email,
      subject: 'BlackSky - Verify your email for Open Collective',
      text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    })
  }
}
```

**File**: `package.json`

Add dependency:

```
"resend": "^4.0.0"
```

Then run `yarn install`.

### Step 5: Add Config Values

**File**: `src/config.ts`

Add to `ServerConfigValues` interface:

```ts
resendApiKey?: string
emailFromAddress?: string
```

In `readEnv()` function, add:

```ts
const resendApiKey = process.env.BSKY_RESEND_API_KEY || undefined
const emailFromAddress = process.env.BSKY_EMAIL_FROM_ADDRESS || undefined
```

Include them in the return object.

Add getters on the `ServerConfig` class:

```ts
get resendApiKey(): string | undefined {
  return this.cfg.resendApiKey
}

get emailFromAddress(): string | undefined {
  return this.cfg.emailFromAddress
}
```

### Step 6: Add Mailer to Context

**File**: `src/context.ts`

Add `mailer` to the opts type / interface:

```ts
mailer?: AppViewMailer
```

Add getter:

```ts
get mailer(): AppViewMailer | undefined {
  return this.opts.mailer
}
```

Import:

```ts
import { AppViewMailer } from './mailer'
```

### Step 7: Wire Mailer in Entry Point

**File**: `src/index.ts`

In `BskyAppView.create()` (or equivalent factory), after other service client creation:

```ts
import { AppViewMailer } from './mailer'

const mailer = config.resendApiKey && config.emailFromAddress
  ? new AppViewMailer(config.resendApiKey, config.emailFromAddress)
  : undefined
```

Pass `mailer` into the `AppContext` constructor options.

### Step 8: Create Express Routes

#### `src/api/oc/pending-verifications.ts` (new)

Shared in-memory store — create this first since the handlers depend on it:

```ts
interface PendingVerification {
  email: string
  code: string
  expiresAt: number
}

export const pendingVerifications = new Map<string, PendingVerification>()

/** Remove expired entries. Call periodically or before lookups. */
export function cleanExpired(): void {
  const now = Date.now()
  for (const [key, val] of pendingVerifications) {
    if (val.expiresAt < now) {
      pendingVerifications.delete(key)
    }
  }
}
```

#### `src/api/oc/link-status.ts` (new)

```ts
import { RequestHandler } from 'express'
import { AppContext } from '../../context'

export function linkStatusHandler(ctx: AppContext): RequestHandler {
  return async (req, res) => {
    try {
      // Auth: verify the request and extract DID
      const auth = await ctx.authVerifier.standard({ req })
      const did = auth.credentials.iss

      // Query DataPlane for existing link
      const result = await ctx.dataplane.getOcEmailLink({ actorDid: did })

      return res.json({
        linked: result.linked,
        email: result.email || undefined,
      })
    } catch (err: any) {
      console.error('OC link-status error:', err)
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }
}
```

> **Adapt auth pattern**: Check how other Express handlers in the codebase call `authVerifier`. The method name might differ (e.g., `ctx.authVerifier.standard()`, `ctx.authVerifier.access()`, etc.). Also confirm that `credentials.iss` is the correct way to get the DID — look at existing handlers for the pattern.

#### `src/api/oc/init-link.ts` (new)

```ts
import crypto from 'node:crypto'
import { RequestHandler } from 'express'
import { AppContext } from '../../context'
import { pendingVerifications, cleanExpired } from './pending-verifications'

const TEN_MINUTES_MS = 10 * 60 * 1000

export function initLinkHandler(ctx: AppContext): RequestHandler {
  return async (req, res) => {
    try {
      const auth = await ctx.authVerifier.standard({ req })
      const did = auth.credentials.iss
      const { email } = req.body

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' })
      }

      // Check if already linked
      const existing = await ctx.dataplane.getOcEmailLink({ actorDid: did })
      if (existing.linked) {
        return res.json({ status: 'linked' })
      }

      // Check if this is a PDS user with a verified email
      // If so, we can link immediately by verifying against their PDS
      const isPdsVerified = await checkPdsEmail(ctx, did, email, req.headers.authorization)

      if (isPdsVerified) {
        // PDS user with matching verified email — link immediately
        await createEmailLink(ctx, did, email)
        return res.json({ status: 'linked' })
      }

      // Non-PDS user (or email doesn't match PDS) — send verification code
      if (!ctx.mailer) {
        return res.status(503).json({
          error: 'Email verification is not configured on this server',
        })
      }

      cleanExpired()

      const code = crypto.randomInt(100000, 999999).toString()
      pendingVerifications.set(did, {
        email: email.toLowerCase(),
        code,
        expiresAt: Date.now() + TEN_MINUTES_MS,
      })

      await ctx.mailer.sendVerificationCode(email, code)
      return res.json({ status: 'verification_needed' })
    } catch (err: any) {
      console.error('OC init-link error:', err)
      return res.status(err.status ?? 500).json({
        error: err.message ?? 'Internal server error',
      })
    }
  }
}

/**
 * Check if the user's DID resolves to a PDS with a verified email matching
 * the provided email. Returns true if verified, false otherwise.
 */
async function checkPdsEmail(
  ctx: AppContext,
  did: string,
  email: string,
  authHeader: string | undefined,
): Promise<boolean> {
  try {
    // Resolve the DID to find their PDS
    const identity = await ctx.dataplane.getIdentityByDid({ did })

    // Check if they have a PDS URL
    // Adapt this based on the actual identity response shape
    const pdsUrl = identity?.pdsUrl || identity?.service
    if (!pdsUrl || !authHeader) {
      return false
    }

    // Forward the bearer token to the PDS to get their session (which includes email)
    const sessionRes = await fetch(
      `${pdsUrl}/xrpc/com.atproto.server.getSession`,
      {
        headers: { Authorization: authHeader },
      },
    )

    if (!sessionRes.ok) {
      return false
    }

    const session = await sessionRes.json() as {
      email?: string
      emailConfirmed?: boolean
    }

    // Only auto-link if the PDS email matches AND is confirmed
    return (
      !!session.email &&
      !!session.emailConfirmed &&
      session.email.toLowerCase() === email.toLowerCase()
    )
  } catch {
    return false
  }
}

/**
 * Create the email link record in private_data via StashClient.
 *
 * IMPORTANT: Verify the StashClient.create() signature before using.
 * The call below is a best guess — adapt to match the actual API:
 *
 * Possible signatures:
 *   ctx.stashClient.create(did, namespace, payload)
 *   ctx.stashClient.create({ actorDid, namespace, payload })
 *   ctx.stashClient.create(namespace, did, rkey, payload)
 */
async function createEmailLink(
  ctx: AppContext,
  did: string,
  email: string,
): Promise<void> {
  // TODO: Adapt to actual StashClient API after verifying its signature.
  // The namespace should be: 'app.bsky.opencollective.defs#emailLink'
  // The payload should be: { email, verifiedAt: new Date().toISOString() }
  //
  // Example (adapt as needed):
  await (ctx as any).stashClient.create(
    did,
    'app.bsky.opencollective.defs#emailLink',
    {
      email,
      verifiedAt: new Date().toISOString(),
    },
  )
}
```

> **CRITICAL TODO**: The `createEmailLink` function uses a placeholder call. Before using, you MUST:
> 1. Check the actual `StashClient.create()` method signature
> 2. Check whether StashClient requires a lexicon schema to validate the payload
> 3. If it does require a schema, either: (a) add a validation bypass for this namespace, or (b) write directly to `private_data` via the DB
> 4. Check how to access the stashClient from context (it may be `ctx.stashClient`, `ctx.services.stash`, etc.)

#### `src/api/oc/verify-email.ts` (new)

```ts
import { RequestHandler } from 'express'
import { AppContext } from '../../context'
import { pendingVerifications, cleanExpired } from './pending-verifications'

export function verifyEmailHandler(ctx: AppContext): RequestHandler {
  return async (req, res) => {
    try {
      const auth = await ctx.authVerifier.standard({ req })
      const did = auth.credentials.iss
      const { email, code } = req.body

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code required' })
      }

      cleanExpired()

      const pending = pendingVerifications.get(did)
      if (!pending) {
        return res.status(400).json({ error: 'No pending verification found. Please request a new code.' })
      }

      if (pending.expiresAt < Date.now()) {
        pendingVerifications.delete(did)
        return res.status(400).json({ error: 'Verification code expired. Please request a new code.' })
      }

      if (pending.code !== code || pending.email !== email.toLowerCase()) {
        return res.status(400).json({ error: 'Invalid verification code' })
      }

      // Code is valid — create the link
      // TODO: Same StashClient caveat as in init-link.ts — adapt the call
      await (ctx as any).stashClient.create(
        did,
        'app.bsky.opencollective.defs#emailLink',
        {
          email: pending.email,
          verifiedAt: new Date().toISOString(),
        },
      )

      pendingVerifications.delete(did)
      return res.json({ status: 'linked' })
    } catch (err: any) {
      console.error('OC verify-email error:', err)
      return res.status(err.status ?? 500).json({
        error: err.message ?? 'Internal server error',
      })
    }
  }
}
```

#### `src/api/oc/index.ts` (new)

```ts
import { json, Router } from 'express'
import { AppContext } from '../../context'
import { linkStatusHandler } from './link-status'
import { initLinkHandler } from './init-link'
import { verifyEmailHandler } from './verify-email'

export const createRouter = (ctx: AppContext): Router => {
  const router = Router()
  router.use(json())
  router.get('/link-status', linkStatusHandler(ctx))
  router.post('/init-link', initLinkHandler(ctx))
  router.post('/verify-email', verifyEmailHandler(ctx))
  return router
}
```

### Step 9: Mount Router

**File**: `src/api/external.ts` (modify)

```ts
import * as ocApi from './oc'

// In createRouter(), add:
router.use('/oc', ocApi.createRouter(ctx))
```

> This mounts at `/external/oc/*`. If the client uses `/api/oc/*`, either:
> - Mount under `/api/oc` instead (check how the Express app routes are structured)
> - Or update the client URLs to match

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/mailer.ts` | Resend email client wrapper |
| `src/api/oc/index.ts` | Express router for OC endpoints |
| `src/api/oc/link-status.ts` | GET handler — check if DID has linked email |
| `src/api/oc/init-link.ts` | POST handler — PDS check + code generation |
| `src/api/oc/verify-email.ts` | POST handler — code validation + link creation |
| `src/api/oc/pending-verifications.ts` | In-memory verification code store |
| `src/data-plane/server/routes/oc.ts` | DataPlane gRPC route for OC email queries |

### Modified Files

| File | Change |
|------|--------|
| `proto/bsky.proto` | Add `GetOcEmailLink` RPC + request/response messages |
| `src/stash.ts` | Add OC namespace string to `Namespaces` |
| `src/config.ts` | Add `resendApiKey`, `emailFromAddress` config values + env reading + getters |
| `src/context.ts` | Add optional `mailer` to opts + getter |
| `src/index.ts` | Create `AppViewMailer` from config, pass to AppContext |
| `src/api/external.ts` | Mount OC router at `/oc` |
| `src/data-plane/server/routes/index.ts` | Register OC DataPlane route |
| `package.json` | Add `resend` dependency |

### No Lexicon Needed

Lexicons define schemas for data stored publicly in AT Protocol user repos. The OC email link data is private server-side storage in the `private_data` table — no lexicon definition is required.

---

## Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `BSKY_RESEND_API_KEY` | No (mailer disabled if absent) | `re_123abc...` |
| `BSKY_EMAIL_FROM_ADDRESS` | No (paired with above) | `noreply@blacksky.community` |

---

## Things to Verify Before / During Implementation

These items require checking against the actual `atproto-private` codebase:

1. **StashClient API**: Find the `StashClient` class, check `.create()` signature, and verify whether it requires lexicon validation. If it does, decide on an alternative approach (direct DB write, or adding a validation bypass).

2. **Auth pattern**: Check how existing Express handlers authenticate requests. Look for `authVerifier.standard()`, `authVerifier.access()`, or similar. Confirm that `credentials.iss` returns the DID.

3. **`private_data` table schema**: Confirm column names (camelCase vs snake_case), and verify the columns available (actorDid/actor_did, namespace, payload, etc.).

4. **Identity resolution**: Verify `ctx.dataplane.getIdentityByDid()` exists and what shape the response has (specifically how to extract the PDS URL).

5. **Route mounting**: Confirm whether to mount at `/external/oc/` or `/api/oc/` based on the Express app structure. Update the client URLs in `blacksky.community/src/state/queries/open-collective.ts` to match whichever path is used.

6. **Proto field numbering**: When adding messages to `bsky.proto`, ensure field numbers don't conflict with existing definitions. Use the next available numbers.

7. **Stash namespace type**: If the `Namespaces` object uses `satisfies` with generated lexicon types, the OC namespace may need to be added differently (e.g., as a separate constant, or with a type assertion).

---

## Build & Verification

```bash
# 1. Regenerate proto TypeScript
yarn buf:gen

# 2. Install new dependency
yarn install

# 3. Full TypeScript compilation
yarn build

# 4. Manual testing (in order)
# a. GET /link-status → { linked: false }
# b. POST /init-link with PDS user email → { status: 'linked' }
# c. POST /init-link with non-PDS email → { status: 'verification_needed' } + email received
# d. POST /verify-email with correct code → { status: 'linked' }
# e. GET /link-status → { linked: true, email: "u***@..." }
```

---

## Client-Side Change (in `blacksky.community`)

If the AppView mounts at a different path than `/api/oc/`, update the three fetch URLs in `src/state/queries/open-collective.ts`:

```ts
// Change from:
`${agent.serviceUrl}/api/oc/link-status`
`${agent.serviceUrl}/api/oc/init-link`
`${agent.serviceUrl}/api/oc/verify-email`

// To (example if mounted at /external/oc):
`${agent.serviceUrl}/external/oc/link-status`
`${agent.serviceUrl}/external/oc/init-link`
`${agent.serviceUrl}/external/oc/verify-email`
```
