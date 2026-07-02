// Client-side mapping from the lexicon `$type` tokens to filterable behavior.
// The lexicon is intentionally token-typed (no coupling to specific record
// schemas); this file is the source of truth for what each token *means* to
// the appview client.
//
// `KNOWN_TYPES` is derived from preference-feed.json's `knownValues` array so
// that adding/removing a token in the JSON automatically widens/narrows the
// `KnownType` union. Adding a new filter behavior still requires a matcher
// here — that mapping cannot live in the JSON without changing the upstream
// schema.

import lex from './preference-feed.json'

export const KNOWN_TYPES = lex.defs.authorFilter.properties.types.items
  .knownValues as readonly string[]

export type KnownType = (typeof KNOWN_TYPES)[number]

export const REPOST_TYPE: KnownType = 'app.bsky.feed.repost'

export const QUOTE_TYPES = [
  'app.bsky.embed.record',
  'app.bsky.embed.recordWithMedia',
] as const satisfies readonly KnownType[]

export function isRepostFilter(types: readonly string[]): boolean {
  return types.includes(REPOST_TYPE)
}

export function isQuoteFilter(types: readonly string[]): boolean {
  return types.some(t => (QUOTE_TYPES as readonly string[]).includes(t))
}
