import {type AppBskyActorDefs, AppBskyEmbedExternal} from '@atproto/api'

import {parseStreamplaceActor} from '#/features/streamplace/url'
import {eventPhase} from './format'
import {type ParsedEvent} from './record'

const LIVE_GRACE_MS = 60 * 60 * 1000

// The host's channel may be live for something else, so only look for a live
// stream from an hour before the event starts until an hour after it ends.
export function inLiveWindow(event: ParsedEvent, now: Date): boolean {
  const t = now.getTime()
  return (
    eventPhase(event, new Date(t + LIVE_GRACE_MS)) !== 'upcoming' &&
    eventPhase(event, new Date(t - LIVE_GRACE_MS)) !== 'past' &&
    !!event.startsAt
  )
}

// A live status can point at any allowed live host, so only count it when it
// points at the same Streamplace channel the event links to.
export function isLiveOnStreamplace(
  status: AppBskyActorDefs.StatusView,
  streamer: {did: string; handle: string},
): boolean {
  if (!status.isActive || !AppBskyEmbedExternal.isView(status.embed)) {
    return false
  }
  const actor = parseStreamplaceActor(status.embed.external.uri)
  return actor === streamer.did || actor === streamer.handle.toLowerCase()
}
