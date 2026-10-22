import {eventPhase} from './format'
import {parseEventRecord} from './record'
import {type EventView} from './types'

/**
 * One list out of the upcoming (soonest first) and past (latest first) pages:
 * events happening now lead, then upcoming, then past. Happening-now events
 * have already started, so they arrive with the past pages.
 */
export function mergeEventTimeline(
  upcoming: EventView[],
  past: EventView[],
  now: Date,
): EventView[] {
  const current: EventView[] = []
  const finished: EventView[] = []
  for (const event of past) {
    const parsed = parseEventRecord(event.record)
    if (parsed && eventPhase(parsed, now) === 'current') {
      current.push(event)
    } else {
      finished.push(event)
    }
  }
  const seen = new Set<string>()
  return [...current, ...upcoming, ...finished].filter(event => {
    if (seen.has(event.uri)) return false
    seen.add(event.uri)
    return true
  })
}
