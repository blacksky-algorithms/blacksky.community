import {type AppBskyActorDefs, type ComAtprotoLabelDefs} from '@atproto/api'

export const EVENT_COLLECTION = 'community.lexicon.calendar.event'
export const RSVP_COLLECTION = 'community.lexicon.calendar.rsvp'

export const RSVP_GOING = 'community.lexicon.calendar.rsvp#going'
export const RSVP_INTERESTED = 'community.lexicon.calendar.rsvp#interested'
export const RSVP_NOTGOING = 'community.lexicon.calendar.rsvp#notgoing'

export type RsvpStatus =
  | typeof RSVP_GOING
  | typeof RSVP_INTERESTED
  | typeof RSVP_NOTGOING

export type EventView = {
  uri: string
  cid: string
  creator: AppBskyActorDefs.ProfileViewBasic
  record: unknown
  thumb?: string
  goingCount: number
  interestedCount: number
  knownGoing?: AppBskyActorDefs.ProfileViewBasic[]
  viewer?: {rsvp?: {uri: string; status: string}}
  labels?: ComAtprotoLabelDefs.Label[]
  indexedAt: string
}

export type RsvpView = {
  uri: string
  status: string
  actor: AppBskyActorDefs.ProfileViewBasic
  indexedAt: string
}
