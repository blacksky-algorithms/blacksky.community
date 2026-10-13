/* eslint-disable bsky-internal/avoid-unwrapped-text */
import {Cluster} from './Cluster.js'
import {Img} from './Img.js'

export const EVENT_HEIGHT = 630
export const EVENT_WIDTH = 1200

export type EventCardData = {
  name: string
  longDate?: string
  timeRange?: string
  place?: string
  cancelled: boolean
  host: string
  posterColors: string[]
  posterEmoji: string
}

type Rec = Record<string, unknown>

const asRec = (v: unknown): Rec | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined
const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined
const asDate = (v: unknown): Date | undefined => {
  const s = asStr(v)
  const d = s ? new Date(s) : undefined
  return d && !isNaN(d.getTime()) ? d : undefined
}
const validZone = (zone: string | undefined) => {
  if (!zone) return
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: zone})
    return zone
  } catch {
    return
  }
}

function describePlace(record: Rec): string | undefined {
  const locations = Array.isArray(record.locations) ? record.locations : []
  for (const item of locations) {
    const loc = asRec(item)
    if (!loc || asStr(loc.uri)) continue
    const parts = [asStr(loc.name), asStr(loc.street), asStr(loc.locality)]
    const text = parts.filter(Boolean).join(', ')
    if (text) return text
  }
  const mode = asStr(record.mode)
  if (mode?.endsWith('#virtual') || mode?.endsWith('#hybrid')) return 'Online'
}

// Mirrors src/features/events/poster.ts in the app so the card matches.
const POSTER_GRADIENTS = [
  ['#464985', '#6060E9', '#8686FF'],
  ['#0A7AFF', '#59B9FF'],
  ['#022C5E', '#4079BC'],
  ['#4E90AE', '#AEA3AB', '#E6A98F', '#F3A84C'],
  ['#6772AF', '#B88BB6', '#FFA6AC'],
  ['#FF6A56', '#FF9156', '#FFDD87'],
  ['#083367', '#9EE8C1'],
  ['#203E4E', '#755B62', '#CD7765', '#EF956E'],
]

const POSTER_KEYWORDS: [RegExp, string][] = [
  [/\b(open mic|karaoke|poetry slam|spoken word)\b/i, '🎤'],
  [/\b(party|parties|birthday|celebration|launch|mixer)\b/i, '🎉'],
  [/\b(music|dj|concert|gig|band|jam|listening|album)\b/i, '🎶'],
  [/\b(film|films|movie|movies|screening|cinema)\b/i, '🎬'],
  [/\b(book|books|reading|library|writing)\b/i, '📚'],
  [
    /\b(brunch|breakfast|lunch|dinner|potluck|cookout|bbq|barbecue|picnic|food)\b/i,
    '🍽️',
  ],
  [/\b(coffee|tea)\b/i, '☕'],
  [/\b(run|running|walk|hike|yoga|workout|fitness|bike|ride)\b/i, '🏃'],
  [/\b(game|games|gaming|trivia|tournament)\b/i, '🎮'],
  [/\b(art|gallery|exhibit|exhibition|museum|craft|crafts)\b/i, '🎨'],
  [/\b(dance|dancing)\b/i, '💃'],
  [/\b(workshop|class|talk|lecture|panel|conference|study)\b/i, '🎓'],
  [
    /\b(meeting|meetup|wg|working group|standup|sync|office hours|town hall|call)\b/i,
    '💬',
  ],
  [/\b(protest|rally|march|vigil)\b/i, '✊'],
]

function hash(str: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function posterEmoji(rec: Rec, name: string) {
  for (const text of [name, asStr(rec.description)]) {
    if (!text) continue
    const match = POSTER_KEYWORDS.find(([re]) => re.test(text))
    if (match) return match[1]
  }
  const links = [
    ...(Array.isArray(rec.uris) ? rec.uris : []),
    ...(Array.isArray(rec.locations) ? rec.locations : []),
  ]
  const streamplace = links.some(item => {
    const uri = asStr(asRec(item)?.uri)
    try {
      return !!uri && /^(www\.)?stream\.place$/.test(new URL(uri).hostname)
    } catch {
      return false
    }
  })
  const mode = asStr(rec.mode)
  if (streamplace) return '📺'
  if (mode?.endsWith('#virtual')) return '💻'
  if (mode?.endsWith('#hybrid')) return '🌐'
  if (mode?.endsWith('#inperson')) return '📍'
  return '📅'
}

export function toEventCardData(record: unknown, host: string, uri: string) {
  const rec = asRec(record)
  const name = asStr(rec?.name)
  if (!rec || !name) return
  const startsAt = asDate(rec.startsAt)
  const endsAt = asDate(rec.endsAt)
  const timeZone = validZone(asStr(rec.timezone)) ?? 'UTC'
  const fmt = (options: Intl.DateTimeFormatOptions, date: Date) =>
    new Intl.DateTimeFormat('en-US', {...options, timeZone}).format(date)
  const time = {hour: 'numeric', minute: '2-digit'} as const
  let longDate: string | undefined
  let timeRange: string | undefined
  if (startsAt) {
    longDate = fmt({weekday: 'long', month: 'long', day: 'numeric'}, startsAt)
    const zone = fmt({timeZoneName: 'short'}, startsAt).split(' ').pop()
    const start = fmt(time, startsAt)
    timeRange =
      `${endsAt ? `${start} – ${fmt(time, endsAt)}` : start} ${zone ?? ''}`.trim()
  }
  return {
    name,
    longDate,
    timeRange,
    place: describePlace(rec),
    cancelled: asStr(rec.status)?.endsWith('#cancelled') ?? false,
    host,
    posterColors: POSTER_GRADIENTS[hash(uri) % POSTER_GRADIENTS.length],
    posterEmoji: posterEmoji(rec, name),
  } satisfies EventCardData
}

export function EventCard({
  event,
  cover,
}: {
  event: EventCardData
  cover: Buffer | null
}) {
  return (
    <div
      style={{
        width: EVENT_WIDTH,
        height: EVENT_HEIGHT,
        display: 'flex',
        backgroundColor: '#0F1419',
        fontFamily: 'Inter',
        color: 'white',
      }}>
      {cover ? (
        <Img
          src={cover}
          width={EVENT_HEIGHT}
          height={EVENT_HEIGHT}
          style={{objectFit: 'cover'}}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            width: EVENT_HEIGHT,
            height: EVENT_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 200,
            backgroundImage: `linear-gradient(160deg, ${event.posterColors.join(', ')})`,
          }}>
          {event.posterEmoji}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: 56,
        }}>
        {event.cancelled && (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              backgroundColor: '#EB3D4D',
              borderRadius: 999,
              padding: '6px 18px',
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 20,
            }}>
            Cancelled
          </div>
        )}
        {event.longDate && (
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              fontWeight: 600,
              color: '#A5A5F5',
            }}>
            {event.longDate}
          </div>
        )}
        <div
          style={{
            display: 'block',
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.2,
            flexShrink: 0,
            marginTop: 12,
            lineClamp: 3,
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}>
          {event.name}
        </div>
        {event.timeRange && (
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: '#C5CFD9',
              marginTop: 20,
            }}>
            {event.timeRange}
          </div>
        )}
        {event.place && (
          <div
            style={{
              display: 'block',
              fontSize: 28,
              color: '#C5CFD9',
              marginTop: 10,
              lineClamp: 1,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
            }}>
            {'📍 ' + event.place}
          </div>
        )}
        <div style={{display: 'flex', flex: 1}} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 24,
            color: '#8B98A5',
          }}>
          <Cluster
            color="white"
            width={36}
            height={31}
            style={{marginRight: 14}}
          />
          <div
            style={{
              display: 'block',
              lineClamp: 1,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              maxWidth: 420,
            }}>
            {'Hosted by ' + event.host}
          </div>
        </div>
      </div>
    </div>
  )
}
