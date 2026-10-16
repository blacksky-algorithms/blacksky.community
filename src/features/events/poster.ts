import {type gradients} from '#/alf/tokens'
import {type ParsedEvent} from './record'

const GRADIENTS: (keyof typeof gradients)[] = [
  'primary',
  'sky',
  'midnight',
  'sunrise',
  'sunset',
  'summer',
  'nordic',
  'bonfire',
]

const KEYWORDS: [RegExp, string][] = [
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

function pickEmoji(event: ParsedEvent) {
  for (const text of [event.name, event.description]) {
    if (!text) continue
    const match = KEYWORDS.find(([re]) => re.test(text))
    if (match) return match[1]
  }
  if (event.streamplaceUrl) return '📺'
  if (event.mode === 'virtual') return '💻'
  if (event.mode === 'hybrid') return '🌐'
  if (event.mode === 'inperson') return '📍'
  return '📅'
}

/** The stand-in poster for an event with no cover. */
export function eventPoster(uri: string, event: ParsedEvent) {
  return {
    gradient: GRADIENTS[hash(uri) % GRADIENTS.length],
    emoji: pickEmoji(event),
  }
}
