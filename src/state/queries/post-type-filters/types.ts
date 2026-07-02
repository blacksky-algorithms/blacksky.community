// Schema: see ./preference-feed.json (community.lexicon.preference.feed)
//
// Hand-mirrored from the JSON so the runtime has no JSON-walk dependency.
// The `knownValues` array in the JSON is also derived into `KNOWN_TYPES` via
// client-map.ts (single source of truth for the `$type` token universe).

import {parseLexiconDoc, type LexiconDoc} from '@atproto/lexicon'

import lex from './preference-feed.json'

export const POST_TYPE_FILTER_LEXICON: LexiconDoc = parseLexiconDoc(lex)
export const POST_TYPE_FILTER_NSID = POST_TYPE_FILTER_LEXICON.id

export type AuthorFilter = {
  subject: string
  types: string[]
  createdAt?: string
  updatedAt?: string
}

export type PostTypeFiltersRecord = {
  $type: typeof POST_TYPE_FILTER_NSID
  filters: AuthorFilter[]
  updatedAt?: string
}
