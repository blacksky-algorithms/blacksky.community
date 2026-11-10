import {TID} from '@atproto/common-web'
import {type $Typed, type Client} from '@atproto/lex'
import {
  type AtIdentifierString,
  type DidString,
  toDatetimeString,
} from '@atproto/syntax'
import {addLabeler} from '@bsky/sdk'
import chunk from 'lodash.chunk'

import {until} from '#/lib/async/until'
import {type ComputedBrandConfig} from '#/lib/community/types'
import {logger} from '#/logger'
import {readLabelers, saveLabelers} from '#/state/session/moderation'
import {app, com} from '#/lexicons'

export async function bulkWriteFollows(
  pdsClient: Client,
  appviewClient: Client,
  dids: string[],
  via?: com.atproto.repo.strongRef.Main,
) {
  const did = pdsClient.assertDid

  const followRecords: $Typed<app.bsky.graph.follow.Main>[] = dids.map(did => {
    return {
      $type: 'app.bsky.graph.follow',
      // the helper takes the dids as plain strings
      subject: did as DidString,
      createdAt: toDatetimeString(new Date()),
      via,
    }
  })

  const followWrites: $Typed<com.atproto.repo.applyWrites.Create>[] =
    followRecords.map(r => ({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'app.bsky.graph.follow',
      rkey: TID.nextStr(),
      value: r,
    }))

  const chunks = chunk(followWrites, 50)
  for (const chunk of chunks) {
    await pdsClient.call(com.atproto.repo.applyWrites, {
      repo: did,
      writes: chunk,
    })
  }
  await whenFollowsIndexed(appviewClient, did, res => !!res?.follows.length)

  const followUris = new Map<string, string>()
  for (const r of followWrites) {
    followUris.set(
      r.value.subject as string,
      `at://${did}/app.bsky.graph.follow/${r.rkey}`,
    )
  }
  return followUris
}

/**
 * Resolves which starter pack URI to use during onboarding.
 * Prefers the active starter pack (from a link click) over the community config default.
 */
export function resolveStarterPackUri(
  activeStarterPackUri: string | undefined,
  brandConfig: ComputedBrandConfig,
): string | undefined {
  return activeStarterPackUri || brandConfig.onboarding.starterPack || undefined
}

/**
 * Builds the deduplicated list of DIDs to auto-follow during onboarding.
 * Merges hardcoded community DIDs, brand config auto-follow DIDs,
 * and starter pack list member DIDs.
 */
export function resolveFollowDids(
  hardcodedDids: string[],
  brandConfig: ComputedBrandConfig,
  starterPackMemberDids: string[],
): string[] {
  return [
    ...new Set([
      ...hardcodedDids,
      ...brandConfig.onboarding.autoFollowDids,
      ...starterPackMemberDids,
    ]),
  ]
}

export function resolveModerationServiceDids(
  brandConfig: ComputedBrandConfig,
): string[] {
  return [...new Set((brandConfig.services.moderation || []).filter(Boolean))]
}

export async function subscribeToBrandModerationServices(
  pdsClient: Client,
  brandConfig: ComputedBrandConfig,
) {
  const accountDid = pdsClient.did
  const dids = resolveModerationServiceDids(brandConfig)
  if (!dids.length) return

  const results = await Promise.allSettled(
    dids.map(async did => {
      await pdsClient.call(addLabeler, did as DidString)
      return did
    }),
  )

  const subscribedDids = results
    .map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      logger.error('Failed to subscribe to brand moderation service', {
        did: dids[i],
        safeMessage: result.reason,
      })
    })
    .filter((did): did is string => !!did)

  if (!accountDid || !subscribedDids.length) return

  try {
    saveLabelers(accountDid, [
      ...new Set([...(readLabelers(accountDid) ?? []), ...subscribedDids]),
    ])
  } catch (e) {
    logger.error('Failed to cache brand moderation services', {safeMessage: e})
  }
}

async function whenFollowsIndexed(
  appviewClient: Client,
  actor: string,
  fn: (
    res: app.bsky.graph.getFollows.$OutputBody | undefined,
    err: unknown,
  ) => boolean,
) {
  await until(
    5, // 5 tries
    1e3, // 1s delay between tries
    fn,
    () =>
      appviewClient.call(app.bsky.graph.getFollows, {
        actor: actor as AtIdentifierString,
        limit: 1,
      }),
  )
}
