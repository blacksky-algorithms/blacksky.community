import {
  type EventView,
  RSVP_GOING,
  RSVP_INTERESTED,
  type RsvpStatus,
} from './types'

const countKey = (status: string | undefined) =>
  status === RSVP_GOING
    ? 'goingCount'
    : status === RSVP_INTERESTED
      ? 'interestedCount'
      : undefined

export function applyRsvp(
  event: EventView,
  next: {uri: string; status: RsvpStatus} | undefined,
): EventView {
  const updated = {...event}
  const prevKey = countKey(event.viewer?.rsvp?.status)
  const nextKey = countKey(next?.status)
  if (prevKey) updated[prevKey] = Math.max(0, updated[prevKey] - 1)
  if (nextKey) updated[nextKey] = updated[nextKey] + 1
  updated.viewer = {...event.viewer, rsvp: next}
  return updated
}
