import {countGraphemes} from 'unicode-segmenter/grapheme'

import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {EVENT_COLLECTION} from './types'

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

export type EventTimeField = 'startsAt' | 'endsAt'

export function changeEventTime(
  draft: EventDraft,
  field: EventTimeField,
  iso: string,
): Partial<EventDraftFields> {
  if (field === 'startsAt' && Date.parse(draft.endsAt) < Date.parse(iso)) {
    return {startsAt: iso, endsAt: iso}
  }
  return {[field]: iso}
}

export function formatEventDraftDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** For `<input type="datetime-local">`, which takes local wall-clock time. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value: string): string | undefined {
  const date = new Date(value)
  return isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function deviceTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    new Intl.DateTimeFormat('en-US', {timeZone: zone})
    return zone
  } catch {
    return undefined
  }
}

function webUrl(value: string): string | undefined {
  try {
    const {protocol} = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

export function buildEventRecord(
  draft: EventDraft,
  {now, timeZone, country}: {now: Date; timeZone?: string; country?: string},
) {
  const description = draft.description.trim()
  const location = draft.location.trim()
  const locationUrl = webUrl(location)
  return {
    $type: EVENT_COLLECTION,
    name: draft.name.trim(),
    createdAt: now.toISOString(),
    startsAt: draft.startsAt,
    ...(draft.endsAt !== draft.startsAt && {endsAt: draft.endsAt}),
    status: `${EVENT_COLLECTION}#scheduled`,
    ...(description && {description}),
    ...(timeZone && {timezone: timeZone}),
    ...(locationUrl
      ? {
          mode: `${EVENT_COLLECTION}#virtual`,
          locations: [{$type: `${EVENT_COLLECTION}#uri`, uri: locationUrl}],
        }
      : location && country
        ? {
            mode: `${EVENT_COLLECTION}#inperson`,
            locations: [
              {
                $type: 'community.lexicon.location.address',
                name: location,
                country,
              },
            ],
          }
        : {}),
  }
}

export function eventPageUrl(did: string, rkey: string) {
  return `${DEFAULT_BRAND_CONFIG.web.domains.main}/event/${did}/${rkey}`
}

export function buildEventExternal(
  draft: EventDraft,
  {did, rkey, locale}: {did: string; rkey: string; locale: string},
) {
  const location = draft.location.trim()
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(draft.startsAt))
  return {
    uri: eventPageUrl(did, rkey),
    title: draft.name.trim(),
    description: location ? `${when} · ${location}` : when,
  }
}
