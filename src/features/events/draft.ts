import {countGraphemes} from 'unicode-segmenter/grapheme'

export const EVENT_NAME_MAX_GRAPHEMES = 180
export const EVENT_DESCRIPTION_MAX_GRAPHEMES = 1000
// The start defaults to "now", so a short grace keeps the warning from
// appearing while the person is still filling in the card.
const PAST_START_GRACE_MS = 15 * 60e3

export type EventDraftStep = 'details' | 'when' | 'cover' | 'done'

export type EventDraft = {
  step: EventDraftStep
  name: string
  description: string
  location: string
  startsAt: string
  endsAt: string
}

export type EventDraftFields = Omit<EventDraft, 'step'>

export function createEventDraft(now = new Date()): EventDraft {
  const start = new Date(now)
  start.setSeconds(0, 0)
  const iso = start.toISOString()
  return {
    step: 'details',
    name: '',
    description: '',
    location: '',
    startsAt: iso,
    endsAt: iso,
  }
}

export function areEventDetailsValid(draft: EventDraft): boolean {
  const name = draft.name.trim()
  return (
    name.length > 0 &&
    countGraphemes(name) <= EVENT_NAME_MAX_GRAPHEMES &&
    countGraphemes(draft.description.trim()) <= EVENT_DESCRIPTION_MAX_GRAPHEMES
  )
}

export function eventEndsBeforeStart(draft: EventDraft): boolean {
  return Date.parse(draft.endsAt) < Date.parse(draft.startsAt)
}

export function eventStartsInPast(draft: EventDraft, now = Date.now()) {
  return Date.parse(draft.startsAt) < now - PAST_START_GRACE_MS
}

export function isEventDraftPublishable(draft: EventDraft): boolean {
  return (
    draft.step === 'done' &&
    areEventDetailsValid(draft) &&
    !eventEndsBeforeStart(draft)
  )
}
