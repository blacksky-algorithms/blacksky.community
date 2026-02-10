# AppView: OC Badge & Membership System

## Implementation Plan for `atproto-private/packages/bsky/`

---

## System Overview

Three separate concerns, three separate services:

| Concern | Owner | What it does |
|---------|-------|-------------|
| **Email linking + badge issuance** | Badge Issuance Service (separate) | Links DID ↔ OC email, polls OC API, writes grant records to BlackSky's repo |
| **Badge indexing + hydration** | AppView (this plan) | Reads grant/claim records from Jetstream, indexes them, serves badge data for profiles |
| **Badge claiming** | Client (blacksky.community) | User claims badge by writing a claim record to their own repo via their PDS |

**The AppView does NOT handle email linking, badge issuance, or repo writes.** It is purely reactive — it indexes records as they appear on the Jetstream and serves read queries. The only AppView work is:

1. **Jetstream indexing** — consume grant/claim records, validate, store in DB (internal, no endpoints)
2. **XRPC query endpoints** — serve badge data for profiles (1-2 read-only endpoints)

No POST endpoints. No write endpoints.

---

## Membership Model

Inspired by the [OpenSocial community membership pattern](https://ngerakines.leaflet.pub/3majmrpjrd22b). Two-way records establish mutual consent:

```
BlackSky's Repo                          User's Repo
───────────────                          ───────────
community.blacksky.badge.grant           community.blacksky.badge.claim
  subject: did:plc:user                    community: did:plc:blacksky
  badge: "oc-contributor"                  grant: { uri, cid } → points to grant
  expiresAt: "2026-03-01T..."              createdAt: "..."
  createdAt: "..."
```

- The **grant** in BlackSky's repo = "BlackSky recognizes this user"
- The **claim** in the user's repo = "I accept and display this membership"
- Both must exist for the badge to be fully active
- This creates two-way consent: the community grants, the individual claims
- The claim UX is also an opportunity for a joyful interaction moment

### Privacy Through Indirection

Following the OpenSocial model: examining BlackSky's repo reveals grants (with subject DIDs), but examining a user's repo only reveals that they claimed *something* from BlackSky — the full picture only emerges when you have both sides. This is less private than the CID-only approach in OpenSocial but is simpler for a v1.

---

## Architecture: What the AppView Does

```
Jetstream                         AppView                              DB
─────────                         ───────                              ──
grant record created  ──────→  index grant                    ───→  badge_grant table
                               queue notification for subject  ───→  notification table

claim record created  ──────→  validate: grant exists +        ───→  badge_claim table
                               subject matches claimer DID

grant record updated  ──────→  upsert grant (renewal)          ───→  badge_grant table
                               (expiresAt updated)

grant record deleted  ──────→  remove grant + orphaned claims  ───→  badge_grant / badge_claim

claim record deleted  ──────→  remove claim                    ───→  badge_claim

XRPC query           ──────→  hydrate badges from index       ───→  query both tables
                               (filter expired grants)
```

**All badge DB writes come from Jetstream indexing. The AppView never writes to repos or to its badge DB from an API call.** This ensures repos are the single source of truth, and the index can be rebuilt from the Jetstream.

---

## Lexicon Definitions

### Record Lexicons (for repo storage)

These define the data that lives in repos. They are NOT AppView endpoints — they're used by the badge issuance service (grants) and the client (claims) when writing to repos.

#### `community.blacksky.badge.grant`

Lives in **BlackSky's repo**. Written by the badge issuance service.

**File**: `lexicons/community/blacksky/badge/grant.json`

```json
{
  "lexicon": 1,
  "id": "community.blacksky.badge.grant",
  "defs": {
    "main": {
      "type": "record",
      "description": "A badge/membership granted by a community to a user account.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "badge", "createdAt"],
        "properties": {
          "subject": {
            "type": "string",
            "format": "did",
            "description": "DID of the user receiving the badge."
          },
          "badge": {
            "type": "string",
            "description": "Badge type identifier, e.g. 'oc-contributor', 'oc-backer', 'oc-sponsor'."
          },
          "expiresAt": {
            "type": "string",
            "format": "datetime",
            "description": "When this badge expires. Null/absent means permanent."
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "metadata": {
            "type": "object",
            "description": "Optional metadata (e.g. contribution tier, amount, period).",
            "properties": {}
          }
        }
      }
    }
  }
}
```

#### `community.blacksky.badge.claim`

Lives in the **user's repo**. Written by the client when the user claims a badge.

**File**: `lexicons/community/blacksky/badge/claim.json`

```json
{
  "lexicon": 1,
  "id": "community.blacksky.badge.claim",
  "defs": {
    "main": {
      "type": "record",
      "description": "A user claiming a badge/membership granted to them by a community.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["community", "badge", "grant", "createdAt"],
        "properties": {
          "community": {
            "type": "string",
            "format": "did",
            "description": "DID of the community that issued the badge (e.g. BlackSky's DID)."
          },
          "badge": {
            "type": "string",
            "description": "Badge type identifier. Must match the grant's badge field."
          },
          "grant": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef",
            "description": "Reference to the badge grant record in the community's repo."
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```

> **On strong refs and renewal**: The grant field uses a strong reference (`{ uri, cid }`). If the badge issuance service renews a grant via `putRecord` (new CID), the existing claim's CID becomes stale. See the "Expiration & Renewal" section for how the AppView handles this.

### Query Lexicons (AppView XRPC endpoints)

These define the AppView's API surface. Following AT Protocol conventions, all AppView endpoints are XRPC methods served at `/xrpc/<method-name>`.

#### `community.blacksky.badge.getBadges`

Public query — returns active (granted + claimed + not expired) badges for any user. Used for profile display.

**File**: `lexicons/community/blacksky/badge/getBadges.json`

```json
{
  "lexicon": 1,
  "id": "community.blacksky.badge.getBadges",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get active badges for a user. Returns only badges that are granted, claimed, and not expired.",
      "parameters": {
        "type": "params",
        "required": ["did"],
        "properties": {
          "did": {
            "type": "string",
            "format": "did",
            "description": "The DID of the user whose badges to fetch."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["badges"],
          "properties": {
            "badges": {
              "type": "array",
              "items": { "type": "ref", "ref": "community.blacksky.badge.defs#badgeView" }
            }
          }
        }
      }
    }
  }
}
```

**Client usage**: `GET /xrpc/community.blacksky.badge.getBadges?did=did:plc:xyz`

#### `community.blacksky.badge.listGrants`

Authenticated query — returns all badge grants for the authenticated user, including unclaimed ones. Used for the claim UI. Follows the convention of `app.bsky.notification.listNotifications`, `app.bsky.bookmark.getBookmarks`, etc. where auth-required endpoints that return your own data don't use a "my" prefix.

**File**: `lexicons/community/blacksky/badge/listGrants.json`

```json
{
  "lexicon": 1,
  "id": "community.blacksky.badge.listGrants",
  "defs": {
    "main": {
      "type": "query",
      "description": "List all badge grants for the authenticated user, including unclaimed grants. Requires authentication.",
      "parameters": {
        "type": "params",
        "properties": {}
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["grants"],
          "properties": {
            "grants": {
              "type": "array",
              "items": { "type": "ref", "ref": "community.blacksky.badge.defs#grantView" }
            }
          }
        }
      }
    }
  }
}
```

**Client usage**: `GET /xrpc/community.blacksky.badge.listGrants` (with auth header)

### Shared Definitions

**File**: `lexicons/community/blacksky/badge/defs.json`

```json
{
  "lexicon": 1,
  "id": "community.blacksky.badge.defs",
  "defs": {
    "badgeType": {
      "type": "string",
      "knownValues": [
        "oc-contributor",
        "oc-backer",
        "oc-sponsor"
      ]
    },
    "badgeView": {
      "type": "object",
      "description": "View of an active badge for public profile display.",
      "required": ["badge", "grantUri", "grantedAt"],
      "properties": {
        "badge": { "type": "string" },
        "grantUri": { "type": "string", "format": "at-uri" },
        "grantedAt": { "type": "string", "format": "datetime" },
        "expiresAt": { "type": "string", "format": "datetime" }
      }
    },
    "grantView": {
      "type": "object",
      "description": "View of a badge grant for the authenticated user, including claim status.",
      "required": ["badge", "grantUri", "grantedAt", "claimed", "active"],
      "properties": {
        "badge": { "type": "string" },
        "grantUri": { "type": "string", "format": "at-uri" },
        "grantedAt": { "type": "string", "format": "datetime" },
        "expiresAt": { "type": "string", "format": "datetime" },
        "claimed": { "type": "boolean" },
        "active": { "type": "boolean" }
      }
    }
  }
}
```

---

## Expiration & Renewal

Grant records have an optional `expiresAt` field. The AppView handles expiration as follows:

### At Query/Hydration Time

When serving badge data for a profile, the AppView filters out expired grants:

```sql
WHERE expires_at IS NULL OR expires_at > NOW()
```

This means expired badges stop appearing on profiles automatically, with no action needed from the badge service or the user.

### Renewal by the Badge Issuance Service

When a subscription renews on Open Collective, the badge service needs to update the grant's `expiresAt`. Two approaches:

**Option A: `putRecord` with deterministic rkey (recommended)**
- Badge service uses a deterministic rkey for grants (e.g., based on badge type + subject DID hash)
- On renewal: `com.atproto.repo.putRecord` with same rkey, updated `expiresAt`
- The URI stays stable; only the CID changes
- Jetstream emits an update event; AppView updates its index
- **Problem**: The user's claim has a strong ref with the old CID. After renewal, the CID doesn't match.
- **Mitigation**: When validating claims, the AppView matches on `grant_uri` only, not `grant_cid`. The CID in the claim proves what the user originally claimed against, but the AppView treats the URI as the stable identifier.

**Option B: Delete + recreate**
- Badge service deletes the old grant, creates a new one
- Jetstream emits delete then create events
- AppView removes old grant from index, adds new one
- **Problem**: Same CID mismatch, plus a brief window where the grant doesn't exist
- **Mitigation**: Same URI-based matching. The gap is generally imperceptible.

**Recommended**: Option A. Use deterministic rkeys so URIs are stable. Validate claims by URI, not CID. The strong ref in the claim serves as a historical attestation ("I claimed this when the CID was X") but doesn't need to stay current for display purposes.

### Lapsed Memberships

When a subscription lapses and isn't renewed:
1. `expiresAt` passes → AppView stops showing the badge (query-time filter)
2. Badge service can optionally delete the grant record after a grace period
3. If deleted, the user's claim becomes orphaned — AppView removes the badge entirely

The user's claim record remains in their repo (they don't need to do anything). It's just inert without a matching active grant.

---

## AppView Implementation Steps

All paths relative to `atproto-private/packages/bsky/`.

### Step 1: Proto Definitions

**File**: `proto/bsky.proto`

Add to the `Service` block:

```protobuf
// Badges
rpc GetBadgesByDid(GetBadgesByDidRequest) returns (GetBadgesByDidResponse);
```

Add message definitions:

```protobuf
//
// Badges
//
message GetBadgesByDidRequest {
  string actor_did = 1;
}

message BadgeView {
  string badge = 1;
  string grant_uri = 2;
  string granted_at = 3;
  string expires_at = 4;    // empty string if permanent
  bool claimed = 5;
  bool active = 6;          // true if not expired and grant exists
}

message GetBadgesByDidResponse {
  repeated BadgeView badges = 1;
}
```

Regenerate:

```bash
yarn buf:gen
```

### Step 2: Database Migration

**File**: `src/data-plane/server/db/migrations/XXXX_badges.ts` (new)

Check the existing migration naming convention in `src/data-plane/server/db/migrations/`, then create:

```ts
import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('badge_grant')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('cid', 'text', (col) => col.notNull())
    .addColumn('issuerDid', 'text', (col) => col.notNull())
    .addColumn('subjectDid', 'text', (col) => col.notNull())
    .addColumn('badge', 'text', (col) => col.notNull())
    .addColumn('expiresAt', 'text')
    .addColumn('metadata', 'text')  // JSON string
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('indexedAt', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_badge_grant_subject')
    .on('badge_grant')
    .column('subjectDid')
    .execute()

  await db.schema
    .createIndex('idx_badge_grant_issuer_subject_badge')
    .on('badge_grant')
    .columns(['issuerDid', 'subjectDid', 'badge'])
    .unique()
    .execute()

  await db.schema
    .createTable('badge_claim')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('cid', 'text', (col) => col.notNull())
    .addColumn('claimerDid', 'text', (col) => col.notNull())
    .addColumn('communityDid', 'text', (col) => col.notNull())
    .addColumn('badge', 'text', (col) => col.notNull())
    .addColumn('grantUri', 'text', (col) => col.notNull())
    .addColumn('grantCid', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('indexedAt', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_badge_claim_claimer')
    .on('badge_claim')
    .column('claimerDid')
    .execute()

  await db.schema
    .createIndex('idx_badge_claim_grant')
    .on('badge_claim')
    .column('grantUri')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('badge_claim').execute()
  await db.schema.dropTable('badge_grant').execute()
}
```

> **Adapt column naming**: Check whether the existing codebase uses camelCase or snake_case for DB columns. The above uses camelCase to match Kysely conventions — adjust if the codebase uses snake_case.

Register the migration in the migration runner (check how existing migrations are registered).

### Step 3: Jetstream Indexer

This is the core integration point. The AppView's indexer needs to handle `community.blacksky.badge.grant` and `community.blacksky.badge.claim` records as they arrive from the Jetstream.

**Find the existing indexer:**

```bash
# Find where records are dispatched by collection type
grep -rn "collection\|indexRecord\|handleCreate\|handleDelete" --include="*.ts" src/

# Look for the pattern — likely a switch/map on collection name
grep -rn "app\.bsky\.\|case.*collection" --include="*.ts" src/
```

**Add grant indexing:**

```ts
// When a community.blacksky.badge.grant record is created or updated:
async function indexBadgeGrant(
  db: Database,
  uri: string,
  cid: string,
  record: BadgeGrantRecord,  // typed from lexicon codegen
  indexedAt: string,
) {
  await db.db
    .insertInto('badge_grant')
    .values({
      uri,
      cid,
      issuerDid: extractDid(uri),  // DID of the repo that contains the record
      subjectDid: record.subject,
      badge: record.badge,
      expiresAt: record.expiresAt ?? null,
      metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      createdAt: record.createdAt,
      indexedAt,
    })
    .onConflict((oc) => oc.column('uri').doUpdateSet({
      cid,
      expiresAt: record.expiresAt ?? null,
      metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      indexedAt,
    }))
    .execute()

  // Queue an AT Protocol notification with custom reason 'badge-granted'.
  // The notification reason type is extensible — the lexicon allows (string & {})
  // so custom reasons will pass through to the client.
  // See "Notification Strategy" section for full details.
  await queueBadgeNotification(db, record.subject, uri, record.badge)
}

// When a community.blacksky.badge.grant record is deleted:
async function deleteBadgeGrant(db: Database, uri: string) {
  // Remove the grant
  await db.db.deleteFrom('badge_grant').where('uri', '=', uri).execute()
  // Remove orphaned claims that referenced this grant
  await db.db.deleteFrom('badge_claim').where('grantUri', '=', uri).execute()
}
```

**Add claim indexing:**

```ts
// When a community.blacksky.badge.claim record is created:
async function indexBadgeClaim(
  db: Database,
  uri: string,
  cid: string,
  record: BadgeClaimRecord,  // typed from lexicon codegen
  claimerDid: string,        // DID of the repo that contains the record
  indexedAt: string,
) {
  // Validate: the referenced grant must exist and target this claimer
  const grant = await db.db
    .selectFrom('badge_grant')
    .where('uri', '=', record.grant.uri)
    .selectAll()
    .executeTakeFirst()

  if (!grant) {
    // Grant doesn't exist (yet?) — skip indexing
    // Could also queue for retry if Jetstream ordering is a concern
    return
  }

  if (grant.subjectDid !== claimerDid) {
    // Claim is for a grant not issued to this user — reject
    return
  }

  if (grant.badge !== record.badge) {
    // Badge type mismatch — reject
    return
  }

  await db.db
    .insertInto('badge_claim')
    .values({
      uri,
      cid,
      claimerDid,
      communityDid: record.community,
      badge: record.badge,
      grantUri: record.grant.uri,
      grantCid: record.grant.cid,
      createdAt: record.createdAt,
      indexedAt,
    })
    .onConflict((oc) => oc.column('uri').doNothing())
    .execute()
}

// When a community.blacksky.badge.claim record is deleted:
async function deleteBadgeClaim(db: Database, uri: string) {
  await db.db.deleteFrom('badge_claim').where('uri', '=', uri).execute()
}
```

> **Notification**: The AT Protocol notification `reason` type is extensible — it includes `(string & {})` in its union, so the AppView can emit notifications with a custom `reason: 'badge-granted'`. Find how existing notification reasons (e.g., `'like'`, `'follow'`) are created during indexing and follow the same pattern for badge grants. See the "Notification Strategy" section below for AppView and client details.

### Step 4: DataPlane Route

**File**: `src/data-plane/server/routes/badges.ts` (new)

```ts
import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect'
import { Database } from '../db'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getBadgesByDid(req) {
    const { actorDid } = req
    const now = new Date().toISOString()

    const rows = await db.db
      .selectFrom('badge_grant')
      .leftJoin('badge_claim', 'badge_claim.grantUri', 'badge_grant.uri')
      .where('badge_grant.subjectDid', '=', actorDid)
      .select([
        'badge_grant.badge',
        'badge_grant.uri as grantUri',
        'badge_grant.createdAt as grantedAt',
        'badge_grant.expiresAt',
        'badge_claim.uri as claimUri',
      ])
      .execute()

    return {
      badges: rows.map((r) => {
        const expired = r.expiresAt ? r.expiresAt < now : false
        return {
          badge: r.badge,
          grantUri: r.grantUri,
          grantedAt: r.grantedAt,
          expiresAt: r.expiresAt ?? '',
          claimed: !!r.claimUri,
          active: !expired && !!r.claimUri,
        }
      }),
    }
  },
})
```

Register in `src/data-plane/server/routes/index.ts`:

```ts
import badges from './badges'

// In the route registration section:
...badges(db),
```

### Step 5: XRPC Endpoint Handlers

Following AT Protocol conventions, the AppView serves all endpoints as XRPC methods at `/xrpc/<method-name>`. Check how existing XRPC query handlers are structured in the codebase:

```bash
# Find existing XRPC handler patterns
grep -rn "app\.bsky\.actor\.getProfile\|xrpc.*handler\|type.*query" --include="*.ts" src/api/
```

**Handler for `community.blacksky.badge.getBadges`** (public):

```ts
// Served at GET /xrpc/community.blacksky.badge.getBadges?did=...
async function getBadges({ params, ctx }) {
  const { did } = params

  const result = await ctx.dataplane.getBadgesByDid({ actorDid: did })

  return {
    encoding: 'application/json',
    body: {
      badges: result.badges
        .filter((b) => b.active)
        .map((b) => ({
          badge: b.badge,
          grantUri: b.grantUri,
          grantedAt: b.grantedAt,
          expiresAt: b.expiresAt || undefined,
        })),
    },
  }
}
```

**Handler for `community.blacksky.badge.listGrants`** (authenticated):

```ts
// Served at GET /xrpc/community.blacksky.badge.listGrants (requires auth)
async function listGrants({ auth, ctx }) {
  const did = auth.credentials.iss

  const result = await ctx.dataplane.getBadgesByDid({ actorDid: did })

  return {
    encoding: 'application/json',
    body: {
      badges: result.badges.map((b) => ({
        badge: b.badge,
        grantUri: b.grantUri,
        grantedAt: b.grantedAt,
        expiresAt: b.expiresAt || undefined,
        claimed: b.claimed,
        active: b.active,
      })),
    },
  }
}
```

> **Adapt to actual XRPC patterns**: The handler signatures above are pseudocode. Check how existing handlers like `app.bsky.actor.getProfile` are structured — they likely follow a specific pattern for auth verification, parameter extraction, and response formatting dictated by the XRPC server framework.

### Step 6: Register XRPC Routes

Find where existing XRPC methods are registered with the server:

```bash
grep -rn "getProfile\|registerRoute\|createRouter\|xrpc.*route" --include="*.ts" src/api/
```

Register the two new query methods following the same pattern as existing handlers.

---

## File Summary

### New Files

| File | Purpose |
|------|---------|
| **Lexicons (record types)** | |
| `lexicons/community/blacksky/badge/grant.json` | Record schema: grant in community repo |
| `lexicons/community/blacksky/badge/claim.json` | Record schema: claim in user repo |
| `lexicons/community/blacksky/badge/defs.json` | Shared type definitions (badgeView, grantView, badgeType) |
| **Lexicons (XRPC queries)** | |
| `lexicons/community/blacksky/badge/getBadges.json` | Query: get active badges for a DID (public) |
| `lexicons/community/blacksky/badge/listGrants.json` | Query: list all grants for authed user (includes unclaimed) |
| **AppView implementation** | |
| `src/data-plane/server/db/migrations/XXXX_badges.ts` | DB migration for badge_grant + badge_claim tables |
| `src/data-plane/server/routes/badges.ts` | DataPlane gRPC route for badge queries |
| XRPC handler file(s) | Handler implementations for getBadges + listGrants |
| Indexer handler(s) | Jetstream consumer logic for grant/claim record events |

### Modified Files

| File | Change |
|------|--------|
| `proto/bsky.proto` | Add `GetBadgesByDid` RPC + messages |
| `src/data-plane/server/routes/index.ts` | Register badge DataPlane route |
| XRPC route registration | Register getBadges + listGrants handlers |
| Jetstream consumer / indexer | Add badge record type handlers for create/update/delete |

---

## Things to Verify Before / During Implementation

1. **Custom lexicon support**: Can the PDS and AppView handle `community.blacksky.*` lexicon namespaces? There may be configuration or registration needed for non-`app.bsky.*` namespaces.

2. **XRPC handler pattern**: How are existing XRPC query handlers structured? What's the function signature, how is auth handled, how are responses formatted? Follow the exact same pattern for the badge query handlers.

3. **Jetstream indexer pattern**: How are existing record types dispatched in the Jetstream consumer? Is it a collection-name switch, a registry pattern, or something else? This determines how to add badge handlers.

4. **Notification creation pattern**: The notification `reason` type is extensible (allows custom strings). Find where existing notifications are created during indexing (e.g., how a `'like'` notification is emitted when a like record is indexed) and follow the same pattern to emit `'badge-granted'` notifications.

5. **Migration pattern**: Check `src/data-plane/server/db/migrations/` for naming convention and how migrations are registered.

6. **Proto field numbering**: Ensure field numbers don't conflict with existing definitions.

7. **Column naming**: Verify camelCase vs snake_case convention for DB columns.

8. **`putRecord` update events**: Verify that the Jetstream emits update events for `putRecord` calls, and that the indexer handles updates (not just creates and deletes). This is critical for the renewal flow.

---

## Notification Strategy

Users are notified about new badges through two channels: a persistent AT Protocol notification (in the notification feed) and a transient toast (immediate in-app feedback).

### Channel 1: AT Protocol Notification (AppView — persistent)

When the AppView indexes a new `community.blacksky.badge.grant` record, it emits an AT Protocol notification with a custom reason:

```ts
// In the grant indexer, after inserting into badge_grant:
// Emit notification using the same mechanism as 'like', 'follow', etc.
// The reason field is extensible — (string & {}) allows custom values.
await createNotification({
  did: record.subject,           // notify the badge recipient
  reason: 'badge-granted',       // custom reason string
  reasonSubject: uri,            // the grant record URI
  author: extractDid(uri),       // BlackSky's DID (the issuer)
  indexedAt,
})
```

Find how existing notification reasons are created during indexing:

```bash
# Find notification creation pattern
grep -rn "createNotification\|reason.*like\|notification.*insert" --include="*.ts" src/
```

Follow the exact same pattern — the notification infrastructure doesn't need modification, only a new call site with `reason: 'badge-granted'`.

**Important**: Only emit a notification on initial grant creation, not on renewals (putRecord updates to the same URI). Check whether the grant URI already exists in `badge_grant` before emitting:

```ts
const isNewGrant = !existingRow // from the upsert check
if (isNewGrant) {
  await createNotification(...)
}
```

### Channel 2: Toast Notification (Client — transient)

The app has an existing toast system built on Sonner (`src/components/Toast/`). When the client detects unclaimed badges, it shows an immediate toast.

**Where to trigger**: In the `listGrants` query hook, when the response contains grants with `claimed: false`:

```ts
// In the grants query hook (new file)
import * as Toast from '#/components/Toast'

// After fetching grants:
const unclaimed = grants.filter(g => !g.claimed && g.active)
if (unclaimed.length > 0) {
  Toast.show('You have a new badge to claim!', {
    type: 'success',
    onPress: () => navigation.navigate('BadgeClaim'),
  })
}
```

**When to show**: Only on initial detection — use a local flag (e.g., AsyncStorage key or query cache) to avoid showing the toast repeatedly.

### How They Work Together

| Channel | When it fires | Where user sees it | Persists? |
|---------|--------------|-------------------|-----------|
| AT Protocol notification | AppView indexes a new grant | Notifications tab | Yes, until read |
| Toast | Client detects unclaimed grant | Bottom of screen (3s) | No, transient |

The notification catches users who weren't in the app when the badge was granted. The toast catches users who are actively using the app. Together they cover both cases.

### Client: Notification Rendering

The client needs to handle the `'badge-granted'` reason in its notification renderer.

**File**: `src/state/queries/notifications/types.ts`

Add `'badge-granted'` to the notification type union:

```ts
type OtherNotificationType =
  | 'post-like'
  | 'feedgen-like'
  | 'repost'
  | ...
  | 'badge-granted'  // new
  | 'unknown'
```

**File**: `src/state/queries/notifications/util.ts`

Map the reason to the type in `toKnownType()`:

```ts
case 'badge-granted':
  return 'badge-granted'
```

**File**: `src/view/com/notifications/NotificationFeedItem.tsx`

Add rendering for the `'badge-granted'` notification type:

- **Icon**: A badge/medal icon
- **Text**: "BlackSky granted you a badge!" (or similar)
- **Action**: Tap navigates to the badge claim screen
- **Subject**: Could show the badge type or a preview of the badge

---

## End-to-End Flow

### Badge Issuance (badge issuance service — not AppView)

1. Badge service polls Open Collective API for contributions
2. Cross-references contributor emails with linked DIDs (from its own email linking DB)
3. For matched users: `com.atproto.repo.putRecord` to BlackSky's repo with a `community.blacksky.badge.grant` record
   - Deterministic rkey: e.g., `oc-contributor-{did-hash}` (stable across renewals)
   - Sets `expiresAt` based on subscription period
4. Record flows through relay → Jetstream

### Badge Indexing (AppView — this plan)

5. AppView's Jetstream consumer sees the grant record
6. Indexes into `badge_grant` table (upsert on URI for renewals)
7. If new grant (not a renewal): emits AT Protocol notification with `reason: 'badge-granted'`

### User Discovery (client — both notification channels)

8a. **Notification feed**: User sees "BlackSky granted you a badge!" in the Notifications tab
8b. **Toast**: If the user is in the app, a toast appears: "You have a new badge to claim!" (triggered when client fetches `listGrants` and sees unclaimed grants)

### Badge Claiming (client → user's PDS — not AppView)

9. User taps notification or toast → navigates to badge claim screen
10. Client calls `com.atproto.repo.createRecord` on the **user's PDS** (not the AppView):
    - Collection: `community.blacksky.badge.claim`
    - Record: `{ community: blackskyDid, badge: "oc-contributor", grant: { uri, cid }, createdAt }`
11. PDS writes the record to the user's repo
12. Record flows through relay → Jetstream
13. AppView indexes the claim after validating it matches a real grant for this user

### Profile Display (client → AppView XRPC query)

14. Client calls `GET /xrpc/community.blacksky.badge.getBadges?did=...`
15. AppView queries `badge_grant` left-joined with `badge_claim`, filters expired grants
16. Returns active badges (granted + claimed + not expired)
17. Client renders badge UI on the profile

### Renewal (badge issuance service — not AppView)

18. Subscription renews on OC
19. Badge service calls `putRecord` with same rkey, updated `expiresAt`
20. Jetstream emits update → AppView upserts the grant with new expiration
21. Badge continues displaying without user action (no new notification)

### Lapse (automatic via expiration)

22. `expiresAt` passes without renewal
23. AppView's query-time filter excludes the badge (no action needed)
24. Optionally, badge service deletes the grant after a grace period
25. If deleted, AppView removes grant + orphaned claims from index

---

## Build & Verification

```bash
# 1. Regenerate proto TypeScript
yarn buf:gen

# 2. Regenerate lexicon types
yarn codegen

# 3. Run migrations
yarn migrate

# 4. Full TypeScript compilation
yarn build

# Manual tests:
# a. Write a badge grant to BlackSky's repo → appears in badge_grant table after Jetstream indexing
# b. Verify AT Protocol notification created for subject DID with reason 'badge-granted'
# c. GET /xrpc/community.blacksky.badge.getBadges?did=... → returns badge
# d. GET /xrpc/community.blacksky.badge.listGrants (authed) → shows grant with claimed: false
# e. Write a badge claim to user's repo (via PDS) → appears in badge_claim table
# f. GET /xrpc/community.blacksky.badge.getBadges?did=... → shows active badge
# g. PUT updated grant with new expiresAt → badge_grant updated, badge still active
# h. Verify NO new notification emitted for renewal (only for initial grant)
# i. Let expiresAt pass → getBadges no longer returns the badge
```

---

## Client-Side Changes (in `blacksky.community`)

### Data Fetching

1. **Badge query hook**: Call `GET /xrpc/community.blacksky.badge.getBadges?did=...` for profile display
2. **Grants query hook**: Call `GET /xrpc/community.blacksky.badge.listGrants` for claim UI (authed)
3. **Claim action**: Call `com.atproto.repo.createRecord` on the user's PDS (not the AppView) with the `community.blacksky.badge.claim` collection

### UI

4. **Profile UI**: Display badges on profile pages/headers
5. **Claim UI**: "You've been granted a badge!" prompt with a claim button — opportunity for joyful interaction (animation, confetti, etc.)

### Notifications (both channels)

6. **AT Protocol notification rendering** — Handle `reason: 'badge-granted'` in the notification feed:
   - Add `'badge-granted'` to `OtherNotificationType` union in `src/state/queries/notifications/types.ts`
   - Map the reason in `toKnownType()` in `src/state/queries/notifications/util.ts`
   - Render in `src/view/com/notifications/NotificationFeedItem.tsx` with a badge icon, descriptive text, and tap-to-claim navigation
7. **Toast on unclaimed badge detection** — In the `listGrants` query hook, when unclaimed active grants are detected:
   - Show toast via `Toast.show('You have a new badge to claim!', { type: 'success', onPress: navigateToClaim })`
   - Track shown state (e.g., AsyncStorage or query cache) to avoid repeat toasts for the same grant
   - Uses existing Sonner-based toast system at `src/components/Toast/`
