import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {EVENT_COLLECTION} from './types'

export type EventRef = {actor: string; rkey: string}

const RKEY_RE = /^[a-zA-Z0-9._:~-]{1,512}$/

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return
  }
}

const blackskyHosts = () => {
  const main = hostOf(DEFAULT_BRAND_CONFIG.web.domains.main)
  return main ? [main, `staging.${main}`] : []
}

// Recognises event links from Blacksky and from other atproto event apps so
// they all render as the same card.
export function parseEventUrl(
  url: string,
  brandDomains: string[] = [],
): EventRef | undefined {
  let urlp: URL
  try {
    urlp = new URL(url)
  } catch {
    return
  }
  const host = urlp.hostname.replace(/^www\./, '')
  const ownHosts = new Set([
    ...blackskyHosts(),
    ...brandDomains.map(hostOf).filter((h): h is string => !!h),
  ])
  const isOwn = ownHosts.has(host)
  if (!isOwn && host !== 'atmo.rsvp' && host !== 'smokesignal.events') return
  let parts: string[]
  try {
    parts = urlp.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return
  }
  let ref: EventRef | undefined
  if (isOwn && parts.length === 3 && parts[0] === 'event') {
    ref = {actor: parts[1], rkey: parts[2]}
  } else if (
    host === 'atmo.rsvp' &&
    parts.length >= 4 &&
    parts[0] === 'p' &&
    parts[2] === 'e'
  ) {
    ref = {actor: parts[1], rkey: parts[3]}
  } else if (host === 'smokesignal.events' && parts.length === 2) {
    ref = {actor: parts[0], rkey: parts[1]}
  }
  if (!ref || !RKEY_RE.test(ref.rkey)) return
  if (!ref.actor.startsWith('did:') && !ref.actor.includes('.')) return
  return ref
}

export function eventAtUri(did: string, rkey: string) {
  return `at://${did}/${EVENT_COLLECTION}/${rkey}`
}

export function makeEventLink(
  creator: {did: string; handle?: string},
  rkey: string,
) {
  const actor =
    creator.handle && creator.handle !== 'handle.invalid'
      ? creator.handle
      : creator.did
  return `/event/${actor}/${rkey}`
}
