import {type BlobRef} from '@atproto/api'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {type ParsedEvent} from './record'
import {EVENT_COLLECTION} from './types'

export const EVENT_NAME_MAX_GRAPHEMES = 180
export const EVENT_DESCRIPTION_MAX_GRAPHEMES = 1000
// The start defaults to "now", so a short grace keeps the warning from
// appearing while the person is still filling in the card.
const PAST_START_GRACE_MS = 15 * 60e3

export type EventDraftStep = 'details' | 'when' | 'cover' | 'done'

export type EventCover =
  | {path: string; mime: string; width: number; height: number}
  | {url: string}

export type EventDraft = {
  step: EventDraftStep
  name: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  cover?: EventCover
  coverRemoved?: boolean
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

export function eventLocationUrl(draft: EventDraft): string | undefined {
  return webUrl(draft.location.trim())
}

// The address lexicon requires a country, and ZZ is CLDR's unknown region.
const UNKNOWN_COUNTRY = 'ZZ'
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i

function webUrl(value: string): string | undefined {
  if (BARE_DOMAIN.test(value)) value = `https://${value}`
  try {
    const {protocol} = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

export function buildEventRecord(
  draft: EventDraft,
  {
    now,
    timeZone,
    country,
    cover,
  }: {
    now: Date
    timeZone?: string
    country?: string
    cover?: {blob: BlobRef; width: number; height: number}
  },
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
    ...(cover && {
      media: [
        {
          role: 'thumbnail',
          content: cover.blob,
          aspect_ratio: {width: cover.width, height: cover.height},
        },
      ],
    }),
    ...(locationUrl
      ? {
          mode: `${EVENT_COLLECTION}#virtual`,
          locations: [{$type: `${EVENT_COLLECTION}#uri`, uri: locationUrl}],
        }
      : location
        ? {
            mode: `${EVENT_COLLECTION}#inperson`,
            locations: [
              {
                $type: 'community.lexicon.location.address',
                name: location,
                country: country || UNKNOWN_COUNTRY,
              },
            ],
          }
        : {}),
  }
}

export function eventDraftFromRecord(
  parsed: ParsedEvent,
  thumb: string | undefined,
  now = new Date(),
): EventDraft {
  const startsAt = (parsed.startsAt ?? now).toISOString()
  return {
    step: 'details',
    name: parsed.name,
    description: parsed.description ?? '',
    location: parsed.location ?? parsed.joinUrl ?? '',
    startsAt,
    endsAt: parsed.endsAt?.toISOString() ?? startsAt,
    ...(thumb && {cover: {url: thumb}}),
  }
}

/**
 * Applies only what the host changed, so fields the composer cannot edit
 * (structured addresses, extra links, other media) survive an edit.
 */
export function applyEventEdits(
  original: Record<string, unknown>,
  initial: EventDraft,
  edited: EventDraft,
  {
    country,
    cover,
  }: {
    country?: string
    cover?: {blob: BlobRef; width: number; height: number} | null
  },
) {
  const built: Record<string, unknown> = buildEventRecord(edited, {
    now: new Date(),
    country,
    cover: cover ?? undefined,
  })
  const record = {...original}
  const take = (key: string) => {
    if (built[key]) record[key] = built[key]
    else delete record[key]
  }
  if (edited.name.trim() !== initial.name.trim()) take('name')
  if (edited.description.trim() !== initial.description.trim()) {
    take('description')
  }
  if (edited.startsAt !== initial.startsAt) take('startsAt')
  if (edited.endsAt !== initial.endsAt) take('endsAt')
  if (edited.location.trim() !== initial.location.trim()) {
    const links =
      original.mode === `${EVENT_COLLECTION}#hybrid` &&
      built.mode === `${EVENT_COLLECTION}#inperson` &&
      Array.isArray(original.locations)
        ? original.locations.filter(l => (l as {uri?: unknown})?.uri)
        : []
    take('locations')
    take('mode')
    if (links.length) {
      record.locations = [...(built.locations as unknown[]), ...links]
      record.mode = original.mode
    }
  }
  if (cover !== undefined) {
    const others = (Array.isArray(original.media) ? original.media : []).filter(
      m => (m as {role?: unknown})?.role !== 'thumbnail',
    )
    const media = [...others, ...((built.media as unknown[] | undefined) ?? [])]
    if (media.length) record.media = media
    else delete record.media
  }
  return record
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

const STEPS: EventDraftStep[] = ['details', 'when', 'cover', 'done']

/** For server drafts, which hold no local files: a picked cover is dropped. */
export function encodeEventDraft({cover, coverRemoved, ...rest}: EventDraft) {
  return {
    ...rest,
    ...(cover && 'url' in cover && {cover: {url: cover.url}}),
    ...(coverRemoved && {coverRemoved}),
  }
}

export function decodeEventDraft(value: unknown): EventDraft | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const strings = ['name', 'description', 'location', 'startsAt', 'endsAt']
  if (
    !STEPS.includes(v.step as EventDraftStep) ||
    !strings.every(k => typeof v[k] === 'string') ||
    isNaN(Date.parse(v.startsAt as string)) ||
    isNaN(Date.parse(v.endsAt as string))
  ) {
    return undefined
  }
  const coverUrl = (v.cover as {url?: unknown} | undefined)?.url
  return {
    step: v.step as EventDraftStep,
    name: v.name as string,
    description: v.description as string,
    location: v.location as string,
    startsAt: v.startsAt as string,
    endsAt: v.endsAt as string,
    ...(typeof coverUrl === 'string' &&
      webUrl(coverUrl) && {cover: {url: coverUrl}}),
    ...(v.coverRemoved === true && {coverRemoved: true}),
  }
}
