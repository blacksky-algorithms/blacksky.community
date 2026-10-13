import {type ComAtprotoLabelDefs} from '@atproto/api'

export type EventMode = 'inperson' | 'virtual' | 'hybrid'

export type EventLink = {uri: string; name?: string}

export type ParsedEvent = {
  name: string
  description?: string
  startsAt?: Date
  endsAt?: Date
  timezone?: string
  mode?: EventMode
  cancelled: boolean
  location?: string
  links: EventLink[]
  streamplaceUrl?: string
  joinUrl?: string
}

const MODE_PREFIX = 'community.lexicon.calendar.event#'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const asDate = (value: unknown): Date | undefined => {
  const str = asString(value)
  if (!str) return
  const date = new Date(str)
  return isNaN(date.getTime()) ? undefined : date
}

const isTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: value})
    return true
  } catch {
    return false
  }
}

const asWebUrl = (value: unknown): string | undefined => {
  const str = asString(value)
  if (!str) return
  try {
    const {protocol} = new URL(str)
    return protocol === 'http:' || protocol === 'https:' ? str : undefined
  } catch {
    return
  }
}

export function isStreamplaceUrl(uri: string): boolean {
  try {
    const {hostname} = new URL(uri)
    return hostname === 'stream.place' || hostname === 'www.stream.place'
  } catch {
    return false
  }
}

function describeLocation(value: unknown): string | undefined {
  const loc = asRecord(value)
  if (!loc) return
  const name = asString(loc.name)
  const parts = [
    asString(loc.street),
    asString(loc.locality),
    asString(loc.region),
  ].filter(Boolean)
  if (name && parts.length) return `${name}, ${parts.join(', ')}`
  if (name) return name
  if (parts.length) return parts.join(', ')
  return asString(loc.country)
}

// Events come from many apps, so every field outside `name` is optional and
// malformed values are dropped rather than failing the whole event.
export function parseEventRecord(record: unknown): ParsedEvent | undefined {
  const rec = asRecord(record)
  const name = asString(rec?.name)
  if (!rec || !name) return

  const links: EventLink[] = []
  if (Array.isArray(rec.uris)) {
    for (const item of rec.uris) {
      const link = asRecord(item)
      const uri = asWebUrl(link?.uri)
      if (uri) links.push({uri, name: asString(link?.name)})
    }
  }
  const locationLinks: EventLink[] = []
  let location: string | undefined
  if (Array.isArray(rec.locations)) {
    for (const item of rec.locations) {
      const loc = asRecord(item)
      if (loc && 'uri' in loc) {
        const uri = asWebUrl(loc.uri)
        if (uri) locationLinks.push({uri, name: asString(loc?.name)})
      } else if (!location) {
        location = describeLocation(loc)
      }
    }
  }

  links.push(...locationLinks)

  const rawMode = asString(rec.mode)?.replace(MODE_PREFIX, '')
  const mode =
    rawMode === 'inperson' || rawMode === 'virtual' || rawMode === 'hybrid'
      ? rawMode
      : undefined
  const timezone = asString(rec.timezone)
  return {
    name,
    description: asString(rec.description),
    startsAt: asDate(rec.startsAt),
    endsAt: asDate(rec.endsAt),
    timezone: timezone && isTimezone(timezone) ? timezone : undefined,
    mode,
    cancelled: asString(rec.status) === `${MODE_PREFIX}cancelled`,
    location,
    links,
    streamplaceUrl: links.find(link => isStreamplaceUrl(link.uri))?.uri,
    joinUrl:
      mode === 'virtual' || mode === 'hybrid'
        ? [...locationLinks, ...links].find(link => !isStreamplaceUrl(link.uri))
            ?.uri
        : undefined,
  }
}

const HIDE_COVER_LABELS = new Set([
  '!hide',
  '!warn',
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'gore',
])

export function coverUrl(event: {
  thumb?: string
  labels?: ComAtprotoLabelDefs.Label[]
}): string | undefined {
  if (event.labels?.some(label => HIDE_COVER_LABELS.has(label.val))) return
  return event.thumb
}
