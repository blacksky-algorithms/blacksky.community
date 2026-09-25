export const STREAMPLACE_ORIGIN = 'https://stream.place'

const HOSTS = new Set(['stream.place', 'www.stream.place'])
const ACTOR_RE =
  /^(did:[a-z]+:[a-zA-Z0-9._:-]+|[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)$/

export function parseStreamplaceActor(url: string): string | undefined {
  let urlp: URL
  try {
    urlp = new URL(url)
  } catch {
    return undefined
  }
  if (!HOSTS.has(urlp.hostname)) return undefined
  const parts = urlp.pathname.split('/').filter(Boolean)
  if (parts[0] === 'embed') parts.shift()
  if (parts.length !== 1) return undefined
  let actor: string
  try {
    actor = decodeURIComponent(parts[0]).replace(/^@/, '')
  } catch {
    return undefined
  }
  if (!ACTOR_RE.test(actor)) return undefined
  return actor.startsWith('did:') ? actor : actor.toLowerCase()
}

export function livePlaylistUrl(actor: string) {
  return `${STREAMPLACE_ORIGIN}/xrpc/place.stream.playback.getLivePlaylist?streamer=${actor}`
}

export function liveSocketUrl(actor: string) {
  return `wss://stream.place/api/websocket/${actor}`
}
