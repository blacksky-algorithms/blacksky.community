export type TileRef = {repo: string; rkey: string}

/** Only Blacksky-owned canonical Tile links may receive the Tile UI treatment. */
export function parseBlackskyTileUrl(uri: string): TileRef | undefined {
  try {
    const url = new URL(uri)
    if (
      url.hostname !== 'blacksky.community' &&
      url.hostname !== 'staging.blacksky.community'
    ) {
      return
    }
    const [prefix, repo, rkey, ...rest] = url.pathname
      .split('/')
      .filter(Boolean)
    if (prefix !== 'tiles' || !repo || !rkey || rest.length) return
    return {repo: decodeURIComponent(repo), rkey: decodeURIComponent(rkey)}
  } catch {
    return
  }
}
