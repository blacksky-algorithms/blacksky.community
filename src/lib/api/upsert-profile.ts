import {type Action, type Un$Typed, XrpcResponseError} from '@atproto/lex'

import {app, com} from '#/lexicons'
import * as bsky from '#/types/bsky'

type Profile = Un$Typed<app.bsky.actor.profile.Main>

type UpsertProfileInput = (
  existing: Profile | undefined,
) => Profile | Promise<Profile>

const COLLECTION = app.bsky.actor.profile.$type
const MAX_ATTEMPTS = 5

function isError(e: unknown, name: string): boolean {
  return e instanceof XrpcResponseError && e.error === name
}

/*
 * The SDK's `upsertProfile` reads the record with strict validation and treats
 * any failed read as "no profile yet". A profile that still holds a legacy blob
 * reference fails that read, so the SDK would replace it with the update alone
 * and drop its avatar, banner and every untouched field. This reads the record
 * as stored and only treats a missing record as missing.
 */
export const upsertProfile: Action<UpsertProfileInput, void> = async (
  client,
  updateFn,
) => {
  const repo = client.assertDid
  for (let attempt = 1; ; attempt++) {
    const existing = await client
      .call(com.atproto.repo.getRecord, {
        repo,
        collection: COLLECTION,
        rkey: 'self',
      })
      .catch((e: unknown) => {
        if (isError(e, 'RecordNotFound')) return undefined
        throw e
      })
    const value = existing?.value
    const updated = await updateFn(
      bsky.matches(app.bsky.actor.profile, value, {strict: false})
        ? value
        : undefined,
    )
    try {
      await client.call(com.atproto.repo.putRecord, {
        repo,
        collection: COLLECTION,
        rkey: 'self',
        record: {...updated, $type: COLLECTION},
        // `null` asserts the record is still absent, so two first writes cannot both land.
        swapRecord: existing ? existing.cid : null,
      })
      return
    } catch (e) {
      if (attempt < MAX_ATTEMPTS && isError(e, 'InvalidSwap')) continue
      throw e
    }
  }
}
