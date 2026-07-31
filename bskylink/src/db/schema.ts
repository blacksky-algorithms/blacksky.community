import {type ToolsOzoneSafelinkDefs} from '@atproto/api'
import {type Generated, type Selectable} from 'kysely'

export type DbSchema = {
  link: Link
  link_event: LinkEvent
  safelink_rule: SafelinkRule
  safelink_cursor: SafelinkCursor
}

export interface Link {
  id: string
  type: LinkType
  path: string
}

export enum LinkType {
  StarterPack = 1,
}

export type LinkEventType = 'redirect' | 'invalid_redirect' | 'shortlink'

export interface LinkEvent {
  id: Generated<number>
  event: LinkEventType
  link: string | null
  host: string | null
  linkId: string | null
  whitelisted: Generated<boolean>
  blocked: Generated<boolean>
  warned: Generated<boolean>
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  referrer: string | null
  createdAt: Generated<Date>
}

export interface SafelinkRule {
  id: number
  eventType: ToolsOzoneSafelinkDefs.EventType
  url: string
  pattern: ToolsOzoneSafelinkDefs.PatternType
  action: ToolsOzoneSafelinkDefs.ActionType
  createdAt: string
}

export interface SafelinkCursor {
  id: number
  cursor: string
  updatedAt: Date
}

export type LinkEntry = Selectable<Link>
export type LinkEventEntry = Selectable<LinkEvent>
export type SafelinkRuleEntry = Selectable<SafelinkRule>
export type SafelinkCursorEntry = Selectable<SafelinkCursor>
