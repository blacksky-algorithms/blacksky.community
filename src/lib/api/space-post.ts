import {type AppBskyFeedPost, type AtpAgent} from '@atproto/api'
import {t} from '@lingui/core/macro'
import {type QueryClient} from '@tanstack/react-query'

import {
  type PostOpts,
  resolveEmbed,
  resolveReply,
  resolveRT,
} from '#/lib/api/index'
import {POST_COLLECTION, spaceCreateRecord} from '#/lib/api/space-write'

/**
 * Post a thread into a permissioned space.
 *
 * Deliberately not a branch inside `postCommunity`: that function implements
 * the Blacksky community feed's three-step write (submit to the appview, write
 * a public stub, admit to the feed generator), and none of those steps exist
 * here. A space post is one ordinary `app.bsky.feed.post` written into the
 * author's own permissioned repo; the syncer materialises it into the feed.
 *
 * Records are built as raw JSON rather than through typed builders, because a
 * reply within a space refers to space URIs, which are not valid at-uris and
 * would fail SDK-side validation.
 */
export async function postToSpace(
  agent: AtpAgent,
  queryClient: QueryClient,
  space: string,
  opts: PostOpts,
): Promise<{uris: string[]}> {
  const thread = opts.thread
  const langs = opts.langs?.slice(0, 3)
  const uris: string[] = []

  // Threads are written in order: each reply refers to the space URI the host
  // returned for the post before it, so they cannot be batched.
  let root: {uri: string; cid: string} | undefined
  let parent: {uri: string; cid: string} | undefined

  // Replying into the space: the first draft hangs off the post being replied
  // to, and everything after it hangs off its predecessor as usual.
  if (opts.replyTo) {
    const replyRef = await resolveReply(agent, opts.replyTo)
    if (replyRef) {
      root = replyRef.root
      parent = replyRef.parent
    }
  }

  for (const draft of thread.posts) {
    const rt = await resolveRT(agent, draft.richtext)
    const embed = await resolveEmbed(
      agent,
      queryClient,
      draft,
      opts.onStateChange,
    )

    const record: Record<string, unknown> = {
      $type: POST_COLLECTION,
      text: rt.text,
      createdAt: new Date().toISOString(),
    }
    if (rt.facets?.length) record.facets = rt.facets
    if (langs?.length) record.langs = langs
    if (embed) record.embed = embed
    if (draft.labels.length) {
      record.labels = {
        $type: 'com.atproto.label.defs#selfLabels',
        values: draft.labels.map(val => ({val})),
      }
    }
    if (root && parent) {
      record.reply = {root, parent}
    }

    opts.onStateChange?.(t`Posting to the private feed...`)
    const written = await spaceCreateRecord(
      agent,
      space,
      POST_COLLECTION,
      record,
    )

    uris.push(written.uri)
    root ??= written
    parent = written
  }

  return {uris}
}

/**
 * Threadgates and postgates are not written into a space.
 *
 * The public gate records address posts by at-uri and are enforced where
 * public content is hydrated, neither of which applies here. The composer
 * hides the controls; this exists so a caller that still holds gate state
 * knows it is intentionally dropped rather than silently lost.
 */
export function spacePostsIgnoreGates(): true {
  return true
}

export type {AppBskyFeedPost}
