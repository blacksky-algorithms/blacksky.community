import {parseSpaceUri, spaceRecordUri} from '#/lib/api/space-uri'
import {POST_COLLECTION} from '#/lib/api/space-write'

/**
 * Rebuild a space post's URI from the parts a route carries.
 *
 * A space record URI has seven segments, of which the path supplies only the
 * author and the rkey; the space itself rides in `?space=`. Returns null when
 * the pieces do not add up — including when `author` is still a handle, which
 * the caller must resolve to a DID first, since the URI form admits only DIDs.
 */
/**
 * True when a link addresses a post inside a permissioned space.
 *
 * A space permalink is an ordinary-looking post URL — the space rides in
 * `?space=`, so nothing about the path distinguishes it. Anything that decides
 * where a post is written has to test the link form as well as the at:// form,
 * because a pasted link is still a link when it reaches the composer.
 */
export function spaceOfPostUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    const space = new URL(url, 'http://_').searchParams.get('space')
    return parseSpaceUri(space) ? space : null
  } catch {
    return null
  }
}

export function isSpacePostUrl(url?: string | null): boolean {
  return !!spaceOfPostUrl(url)
}

export function spacePostUriFromRoute(
  space: string | undefined,
  author: string,
  rkey: string,
  collection: string = POST_COLLECTION,
): string | null {
  if (!space) return null
  const ref = parseSpaceUri(space)
  if (!ref || !author.startsWith('did:')) return null
  return spaceRecordUri({...ref, authorDid: author, collection, rkey})
}
