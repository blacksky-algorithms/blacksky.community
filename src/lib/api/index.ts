import {getLocales} from 'expo-localization'
import {TID} from '@atproto/common-web'
import {
  type $Typed,
  type BlobRef,
  type Client,
  jsonToLex,
  type LexMap,
} from '@atproto/lex'
import {
  AtUri,
  type AtUriString,
  toDatetimeString,
  type UriString,
} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {t} from '@lingui/core/macro'
import {type QueryClient} from '@tanstack/react-query'

import {
  assemblyThumbUrl,
  buildAssemblyExternal,
  ensureAssembly,
} from '#/lib/api/assembly'
import {communityXrpc} from '#/lib/api/community'
import {
  admitFeedPost,
  fetchCommunityFeedTarget,
  isSpaceBackedFeed,
} from '#/lib/api/community-feed'
import {fetchCommunityPostView} from '#/lib/api/community-post'
import {
  type AssemblyRef,
  type PollDraft,
  pollStatementsForPublish,
  pollTopicFromText,
} from '#/lib/api/poll'
import {imageToThumb} from '#/lib/api/resolve'
import {type LinkResolvers} from '#/lib/api/resolve'
import {spaceOfPostUrl} from '#/lib/api/space-permalink'
import {postToSpace} from '#/lib/api/space-post'
import {isSpaceRecordUri, spaceOfRecordUri} from '#/lib/api/space-uri'
import {withCreator} from '#/lib/at-card'
import {IMAGE_SIZE_CONFIG_POSTS} from '#/lib/constants'
import {isNetworkError} from '#/lib/strings/errors'
import {shortenLinks, stripInvalidMentions} from '#/lib/strings/rich-text-manip'
import {logger} from '#/logger'
import {compressImage} from '#/state/gallery'
import {
  fetchResolveGifQuery,
  fetchResolveLinkQuery,
} from '#/state/queries/resolve-link'
import {
  createThreadgateRecord,
  threadgateAllowUISettingToAllowRecordValue,
} from '#/state/queries/threadgate'
import {
  type EmbedDraft,
  type PostDraft,
  type ThreadDraft,
} from '#/view/com/composer/state/composer'
import {
  buildEventExternal,
  buildEventRecord,
  deviceTimeZone,
  type EventCover,
} from '#/features/events/draft'
import {EVENT_COLLECTION} from '#/features/events/types'
import {eventAtUri} from '#/features/events/url'
import {app, chat, com} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {createGIFDescription} from '../gif-alt-text'
import {computeCid} from './computeCid'
import {uploadBlob} from './upload-blob'

export {uploadBlob}

const COMMUNITY_POST_COLLECTION = 'community.blacksky.feed.post'
const ASSEMBLY_THUMB_TIMEOUT_MS = 5e3

/**
 * The space a quote belongs to, whichever form it is in — a pasted permalink
 * carries the space in `?space=` and is only expanded to its at:// form at
 * publish, long after routing has decided where the post goes.
 */
export function quotedSpace(uri?: string | null): string | null {
  return spaceOfRecordUri(uri) ?? spaceOfPostUrl(uri)
}

function embedNamesSpaceRecord(embed: unknown): boolean {
  if (!embed || typeof embed !== 'object') return false
  const record = (embed as {record?: unknown}).record
  if (!record || typeof record !== 'object') return false
  const uri =
    (record as {uri?: unknown}).uri ??
    (record as {record?: {uri?: unknown}}).record?.uri
  return typeof uri === 'string' && isSpaceRecordUri(uri)
}

function refusePoll(thread: ThreadDraft) {
  if (thread.posts.some(p => p.embed.poll)) {
    throw new Error(t`Discussions are only available on public posts.`)
  }
}

function refuseEvent(thread: ThreadDraft) {
  if (thread.posts.some(p => p.embed.event)) {
    throw new Error(t`Events are only available on public posts.`)
  }
}

function refusePollWithAttachments(draft: PostDraft) {
  if (
    draft.embed.poll &&
    (draft.embed.media || draft.embed.link || draft.embed.quote)
  ) {
    throw new Error(
      t`A discussion cannot be combined with media, a link card or a quote.`,
    )
  }
}

function findPollPost(thread: ThreadDraft): PostDraft | undefined {
  const [pollPost, ...others] = thread.posts.filter(p => p.embed.poll)
  if (others.length) {
    throw new Error(t`A thread can only have one discussion.`)
  }
  if (pollPost) {
    refusePollWithAttachments(pollPost)
  }
  return pollPost
}

export interface PostOpts {
  thread: ThreadDraft
  draftId?: string
  replyTo?: string
  onStateChange?: (state: string) => void
  onAssembly?: (postId: string, ref: AssemblyRef) => void
  langs?: string[]
  /*
   * Facet/mention resolution and reply-root lookup are appview jobs - they
   * resolve handles and read posts through the appview, and the public
   * fallback keeps facet detection working when logged out.
   */
  appviewClient: Client
  /*
   * A quoted chat invite link resolves its preview through the chat service, so
   * the embed resolver needs the chat client alongside the appview one.
   */
  chatClient: Client
  /*
   * The repo write itself (applyWrites) plus every record blob (images,
   * gallery items, link thumbnails, video captions) goes to the account's own
   * PDS, never the appview.
   */
  pdsClient: Client
}

export type PostResult = {
  uris: string[]
  event?: {uri: string}
  assembly?: {
    conversationId: string
    statementCount: number
    isReplay: boolean
  }
}

export async function post(
  queryClient: QueryClient,
  opts: PostOpts,
): Promise<PostResult> {
  let thread = opts.thread
  const replySpace = spaceOfRecordUri(opts.replyTo)
  // Replying to or quoting a space post: the parent's space is the target, and
  // no feed needs resolving — a feed is only a view over the space.
  if (thread.communitySpaceUri || replySpace) {
    const space = thread.communitySpaceUri ?? replySpace!
    if (
      thread.communitySpaceUri &&
      replySpace &&
      thread.communitySpaceUri !== replySpace
    ) {
      throw new Error(
        t`This reply targets a different private space than its parent.`,
      )
    }
    refusePoll(thread)
    refuseEvent(thread)
    return postToSpace(queryClient, space, opts)
  }

  if (!thread.communityFeed && thread.communityFeedUri) {
    const target = await fetchCommunityFeedTarget(
      opts.appviewClient,
      thread.communityFeedUri,
    )
    if (!target) {
      throw new Error(
        t`You no longer have permission to post to this community.`,
      )
    }
    thread = {...thread, communityFeed: target}
    opts = {...opts, thread}
  }
  opts.onStateChange?.(t`Processing...`)

  // A space-backed feed keeps its content in the author's permissioned repo,
  // so it takes an entirely different write path and must be checked before
  // the community routing below, which would otherwise claim it.
  const config = thread.communityFeed?.config
  if (isSpaceBackedFeed(config)) {
    refusePoll(thread)
    refuseEvent(thread)
    return postToSpace(queryClient, config.space, opts)
  }

  // Past this point the post is going to a public or community repo, not into
  // any space, so nothing it carries may name one. A quote reaches the composer
  // as a pasted link and is only expanded to its at:// form at publish, by
  // which time the routing decision is made — so both forms are refused here,
  // together. Without this a pasted space permalink rides `postCommunity`'s
  // stub embed into the author's public repo, publishing the existence of a
  // private post.
  if (thread.posts.some(p => quotedSpace(p.embed.quote?.uri))) {
    throw new Error(
      t`This is a private post. You can only quote it in a post to that space.`,
    )
  }

  // Route to community post endpoint if the user explicitly toggled
  // Blacksky-Only, is replying to a community post, or is quoting one.
  const isReplyToCommunityPost =
    opts.replyTo && opts.replyTo.includes(COMMUNITY_POST_COLLECTION)
  const isQuoteOfCommunityPost = thread.posts.some(p =>
    p.embed.quote?.uri?.includes(COMMUNITY_POST_COLLECTION),
  )
  const selectedCommunityRecordFeed =
    thread.communityFeed?.config.contentType === 'communityRecord'

  if (
    thread.blackskyOnly ||
    selectedCommunityRecordFeed ||
    isReplyToCommunityPost ||
    isQuoteOfCommunityPost
  ) {
    refusePoll(thread)
    refuseEvent(thread)
    return postCommunity(queryClient, opts)
  }

  // A public post must never carry a community post in its embed; the
  // routing above sends those to postCommunity, so reaching here with one
  // is a bug we refuse rather than leak community content publicly. A space
  // record is refused for the same reason, and its URI would leak the space
  // even if the appview declined to hydrate it.
  if (
    thread.posts.some(
      p =>
        p.embed.quote?.uri?.includes(COMMUNITY_POST_COLLECTION) ||
        isSpaceRecordUri(p.embed.quote?.uri),
    )
  ) {
    throw new Error('Public posts cannot embed a community post')
  }

  const pollPost = findPollPost(thread)
  const eventPost = thread.posts.find(p => p.embed.event)
  const eventRkey = eventPost ? TID.nextStr() : undefined
  const locale = getLocales()[0]

  let replyPromise:
    | Promise<app.bsky.feed.post.Main['reply']>
    | app.bsky.feed.post.Main['reply']
    | undefined
  if (opts.replyTo) {
    // Not awaited to avoid waterfalls.
    replyPromise = resolveReply(opts.appviewClient, opts.replyTo)
  }

  let assembly: PostResult['assembly']
  const poll = pollPost?.embed.poll
  if (pollPost && poll) {
    // An assembly is public and cannot be withdrawn, so a reply whose parent
    // is gone has to fail before one is started.
    await replyPromise
    opts.onStateChange?.(t`Starting discussion...`)
    const statements = pollStatementsForPublish(poll)
    const {ref, isReplay} = await ensureAssembly(opts.pdsClient, {
      topic: pollTopicFromText(pollPost.richtext.text),
      statements,
      ref: poll.assembly,
      onRef: next => opts.onAssembly?.(pollPost.id, next),
    })
    assembly = {
      conversationId: ref.conversationId,
      statementCount: statements.length,
      isReplay,
    }
    thread = {
      ...thread,
      posts: thread.posts.map(p =>
        p === pollPost
          ? {...p, embed: {...p.embed, poll: {...poll, assembly: ref}}}
          : p,
      ),
    }
  }

  // add top 3 languages from user preferences if langs is provided
  let langs = opts.langs
  if (opts.langs) {
    langs = opts.langs.slice(0, 3)
  }

  const eventCover = eventPost?.embed.event?.cover
    ? await uploadEventCover(
        opts.pdsClient,
        eventPost.embed.event.cover,
        opts.onStateChange,
      )
    : undefined

  const did = opts.pdsClient.assertDid
  const writes: com.atproto.repo.applyWrites.$InputBody['writes'] = []
  const uris: string[] = []
  const admissions: Array<{post: string; cid: string}> = []

  let now = new Date()
  let tid: TID | undefined

  for (let i = 0; i < thread.posts.length; i++) {
    const draft = thread.posts[i]

    // Not awaited to avoid waterfalls.
    const rtPromise = resolveRT(opts.appviewClient, draft.richtext)
    const embedPromise: Promise<app.bsky.feed.post.Main['embed']> =
      draft === eventPost && eventRkey
        ? Promise.resolve({
            $type: 'app.bsky.embed.external' as const,
            external: {
              ...buildEventExternal(draft.embed.event!, {
                did,
                rkey: eventRkey,
                locale: locale?.languageTag ?? 'en-US',
              }),
              ...(eventCover && {thumb: eventCover.blob}),
            },
          })
        : resolveEmbed(
            opts.appviewClient,
            opts.chatClient,
            opts.pdsClient,
            queryClient,
            draft,
            opts.onStateChange,
          )
    let labels: $Typed<com.atproto.label.defs.SelfLabels> | undefined
    if (draft.labels.length) {
      labels = {
        $type: 'com.atproto.label.defs#selfLabels',
        values: draft.labels.map(val => ({val})),
      }
    }

    // The sorting behavior for multiple posts sharing the same createdAt time is
    // undefined, so what we'll do here is increment the time by 1 for every post
    now.setMilliseconds(now.getMilliseconds() + 1)
    tid = TID.next(tid)
    const rkey = tid.toString()
    const uri = `at://${did}/app.bsky.feed.post/${rkey}` as AtUriString
    uris.push(uri)

    const rt = await rtPromise
    const embed = await embedPromise
    const reply = await replyPromise
    const record: app.bsky.feed.post.Main = {
      // IMPORTANT: $type has to exist, CID is calculated with the `$type` field
      // present and will produce the wrong CID if you omit it.
      $type: 'app.bsky.feed.post',
      createdAt: toDatetimeString(now),
      text: rt.text,
      facets: rt.facets,
      reply,
      embed,
      langs,
      labels,
    }
    writes.push({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'app.bsky.feed.post',
      rkey: rkey,
      value: record,
    })

    if (i === 0 && thread.threadgate.some(tg => tg.type !== 'everybody')) {
      writes.push({
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        value: createThreadgateRecord({
          createdAt: toDatetimeString(now),
          post: uri,
          allow: threadgateAllowUISettingToAllowRecordValue(thread.threadgate),
        }),
      })
    }

    if (
      thread.postgate.embeddingRules?.length ||
      thread.postgate.detachedEmbeddingUris?.length
    ) {
      writes.push({
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.feed.postgate',
        rkey: rkey,
        value: {
          ...thread.postgate,
          $type: 'app.bsky.feed.postgate',
          createdAt: toDatetimeString(now),
          post: uri,
        },
      })
    }

    // Prepare a ref to the current post for the next post in the thread.
    const ref = {
      cid: await computeCid(record),
      uri,
    }
    if (thread.communityFeed?.config.contentType === 'publicRecord') {
      admissions.push({post: uri, cid: ref.cid})
    }
    replyPromise = {
      root: reply?.root ?? ref,
      parent: ref,
    }
  }

  if (eventPost?.embed.event && eventRkey) {
    writes.unshift({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: EVENT_COLLECTION,
      rkey: eventRkey,
      value: buildEventRecord(eventPost.embed.event, {
        now: new Date(),
        timeZone: deviceTimeZone(),
        country: locale?.regionCode ?? undefined,
        cover: eventCover,
      }),
    })
  }

  try {
    await opts.pdsClient.call(com.atproto.repo.applyWrites, {
      repo: did,
      writes: writes,
      // A PDS refuses lexicons it does not know when asked to validate, and
      // most do not know the event lexicon. Left unset, known ones such as
      // the post are still validated.
      validate: eventPost ? undefined : true,
    })
  } catch (err) {
    const e = err as Error
    logger.error(`Failed to create post`, {
      safeMessage: e.message,
    })
    if (isNetworkError(e)) {
      throw new Error(
        t`Post failed to upload. Please check your Internet connection and try again.`,
      )
    } else {
      throw e
    }
  }

  if (thread.communityFeed?.config.contentType === 'publicRecord') {
    await Promise.all(
      admissions.map(({post, cid}) =>
        admitFeedPost(opts.appviewClient, thread.communityFeed!, post, cid),
      ),
    )
  }

  return {
    uris,
    assembly,
    ...(eventRkey && {event: {uri: eventAtUri(did, eventRkey)}}),
  }
}

async function postCommunity(queryClient: QueryClient, opts: PostOpts) {
  const thread = opts.thread

  let replyPromise:
    | Promise<app.bsky.feed.post.Main['reply']>
    | app.bsky.feed.post.Main['reply']
    | undefined
  if (opts.replyTo) {
    replyPromise = resolveReply(opts.appviewClient, opts.replyTo)
  }

  let langs = opts.langs
  if (opts.langs) {
    langs = opts.langs.slice(0, 3)
  }

  const did = opts.pdsClient.assertDid
  const writes: com.atproto.repo.applyWrites.$InputBody['writes'] = []
  const uris: string[] = []
  const admissions: Array<{post: string; cid: string}> = []

  let now = new Date()
  let tid: TID | undefined

  for (let i = 0; i < thread.posts.length; i++) {
    const draft = thread.posts[i]

    const rtPromise = resolveRT(opts.appviewClient, draft.richtext)
    const embedPromise = resolveEmbed(
      opts.appviewClient,
      opts.chatClient,
      opts.pdsClient,
      queryClient,
      draft,
      opts.onStateChange,
    )
    let labels: $Typed<com.atproto.label.defs.SelfLabels> | undefined
    if (draft.labels.length) {
      labels = {
        $type: 'com.atproto.label.defs#selfLabels',
        values: draft.labels.map(val => ({val})),
      }
    }

    now.setMilliseconds(now.getMilliseconds() + 1)
    tid = TID.next(tid)
    const rkey = tid.toString()
    const uri = `at://${did}/${COMMUNITY_POST_COLLECTION}/${rkey}`
    uris.push(uri)

    const rt = await rtPromise
    const resolvedEmbed = await embedPromise
    const reply = await replyPromise

    // Community posts use the community video embed type, which allows
    // larger files than app.bsky.embed.video permits.
    const embed =
      resolvedEmbed?.$type === 'app.bsky.embed.video'
        ? {...resolvedEmbed, $type: 'community.blacksky.embed.video'}
        : resolvedEmbed

    // Step 1: Build the canonical record for CID computation
    // This MUST match the structure the appview uses for CID verification
    const createdAt = now.toISOString()
    const canonicalRecord: Record<string, unknown> = {
      $type: COMMUNITY_POST_COLLECTION,
      text: rt.text,
      createdAt,
    }
    if (rt.facets?.length) {
      canonicalRecord.facets = rt.facets
    }
    if (langs?.length) {
      canonicalRecord.langs = langs
    }
    if (embed) {
      canonicalRecord.embed = embed
    }
    if (reply) {
      canonicalRecord.reply = reply
    }

    // Step 2: Compute CID locally - this is the SOURCE OF TRUTH for integrity
    const cid = await computeCid(
      canonicalRecord as unknown as app.bsky.feed.post.Main,
    )

    // Step 3: Submit to appview with expectedCid for verification
    opts.onStateChange?.(t`Submitting to community...`)
    const submitBody: Record<string, unknown> = {
      rkey,
      text: rt.text,
      createdAt,
      expectedCid: cid, // Appview will verify this matches
    }
    if (rt.facets?.length) {
      submitBody.facets = rt.facets
    }
    if (reply) {
      submitBody.reply = reply
    }
    if (embed) {
      submitBody.embed = embed
    }
    if (langs?.length) {
      submitBody.langs = langs
    }
    if (labels) {
      submitBody.labels = labels
    }
    // Interaction gates: root posts only for threadgates, community $types.
    if (!reply && thread.threadgate.some(tg => tg.type !== 'everybody')) {
      submitBody.threadgateAllow = (
        threadgateAllowUISettingToAllowRecordValue(thread.threadgate) ?? []
      ).map(rule => ({
        ...rule,
        $type: String(rule.$type).replace(
          'app.bsky.feed.threadgate',
          'community.blacksky.feed.threadgate',
        ),
      }))
    }
    if (thread.postgate.embeddingRules?.length) {
      submitBody.embeddingRules = thread.postgate.embeddingRules.map(rule => ({
        ...rule,
        $type: rule.$type.replace(
          'app.bsky.feed.postgate',
          'community.blacksky.feed.postgate',
        ),
      }))
    }

    try {
      const submitRes = await communityXrpc(
        opts.appviewClient,
        'community.blacksky.feed.submitPost',
        // No serviceDid: submitPost serves the Blacksky community feed, whose
        // content lives on the home appview. `contentStore` named a per-feed
        // appview for the retired multi-tenant path and was always undefined
        // here, so the proxy target is unchanged.
        {body: submitBody},
      )
      if (!submitRes.ok) {
        const errBody = (await submitRes.json().catch(() => ({}))) as {
          message?: string
        }
        throw new Error(errBody.message || `HTTP ${submitRes.status}`)
      }
      // Appview returns the verified CID - should match our local computation
      const submitData = (await submitRes.json()) as {cid?: string}
      if (submitData?.cid !== cid) {
        logger.warn(`CID mismatch: local=${cid}, server=${submitData?.cid}`)
      }
    } catch (e) {
      const serverMessage = e instanceof Error ? e.message : String(e)
      logger.error(`Failed to submit community post content`, {
        safeMessage: serverMessage,
      })
      // Surface the server's reason (e.g. threadgate/quote restrictions)
      // instead of a generic failure.
      const isUserFacing =
        serverMessage &&
        !serverMessage.startsWith('HTTP') &&
        !/InternalServerError|fetch|network/i.test(serverMessage)
      throw new Error(
        isUserFacing
          ? serverMessage
          : t`Failed to submit community post. Please try again.`,
      )
    }

    // Step 4: Build stub record for PDS with CLIENT-COMPUTED CID
    const stubRecord: Record<string, unknown> = {
      $type: COMMUNITY_POST_COLLECTION,
      createdAt,
      cid, // Client's own CID - source of truth for integrity verification
    }
    // The PDS only protects blobs that are referenced from a record on the
    // repo (enumBlobRefs walks the record tree). Mirror the embed onto the
    // stub so external-thumb / image / video / gallery blobs stay alive for
    // the post's lifetime. Text / facets / langs / reply remain appview-only.
    if (embed) {
      // The stub goes to the author's public repo, so it is the last place a
      // space URI could leak from. The routing guard in `post` already refuses
      // these; this is the invariant restated where the write happens.
      if (embedNamesSpaceRecord(embed)) {
        throw new Error(
          t`This is a private post. You can only quote it in a post to that space.`,
        )
      }
      stubRecord.embed = embed
    }

    writes.push({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: COMMUNITY_POST_COLLECTION,
      rkey,
      value: stubRecord as LexMap,
    })

    // Prepare ref for next post in thread
    const ref = {
      cid: await computeCid(stubRecord as unknown as app.bsky.feed.post.Main),
      uri,
    }
    if (thread.communityFeed) {
      admissions.push({post: uri, cid: ref.cid})
    }
    replyPromise = {
      root: reply?.root ?? ref,
      parent: ref,
    } as ReplyRefs
  }

  // Write stubs to PDS
  try {
    await opts.pdsClient.call(com.atproto.repo.applyWrites, {
      repo: did,
      writes,
      validate: false,
    })
  } catch (e) {
    logger.error(`Failed to write community post stubs`, {
      safeMessage: e instanceof Error ? e.message : String(e),
    })
    if (isNetworkError(e)) {
      throw new Error(
        t`Post failed to upload. Please check your Internet connection and try again.`,
      )
    } else {
      throw e
    }
  }

  if (thread.communityFeed) {
    await Promise.all(
      admissions.map(({post, cid}) =>
        admitFeedPost(opts.appviewClient, thread.communityFeed!, post, cid),
      ),
    )
  }

  void queryClient.invalidateQueries({queryKey: ['community-timeline']})
  void queryClient.invalidateQueries({queryKey: ['community-feed']})

  return {uris}
}

export async function resolveRT(appviewClient: Client, richtext: RichText) {
  const trimmedText = richtext.text
    // Trim leading whitespace-only lines (but don't break ASCII art).
    .replace(/^(\s*\n)+/, '')
    // Trim any trailing whitespace.
    .trimEnd()
  let rt = new RichText({text: trimmedText}, {cleanNewlines: true})
  await rt.detectFacets(appviewClient)

  rt = shortenLinks(rt)
  rt = stripInvalidMentions(rt)
  return rt
}

export class ReplyDeletedError extends Error {
  constructor() {
    super('Could not resolve reply')
  }
}

/**
 * The reply refs a caller gets back from the non-space branches go straight
 * into a public `app.bsky.feed.post`, so a thread root that turns out to name a
 * space has to stop here: the space branch above is the only one allowed to
 * return one.
 */
function refusePublicSpaceRefs<
  T extends {root: {uri: string}; parent: {uri: string}},
>(refs: T): T {
  if (isSpaceRecordUri(refs.root.uri) || isSpaceRecordUri(refs.parent.uri)) {
    throw new Error(
      t`This is a private post. You can only reply to it in that space.`,
    )
  }
  return refs
}

type ReplyRefs = NonNullable<app.bsky.feed.post.Main['reply']>

/*
 * Typed as post reply refs even though a ref into a permissioned space is not
 * an at-uri: the space write path sends these as plain JSON, and the public
 * branches refuse a space ref before returning one.
 */
export async function resolveReply(
  appviewClient: Client,
  replyTo: string,
): Promise<ReplyRefs | undefined> {
  return (await resolveReplyRefs(appviewClient, replyTo)) as
    ReplyRefs | undefined
}

async function resolveReplyRefs(appviewClient: Client, replyTo: string) {
  // Space records first: they are not at-uris, so AtUri would misparse one.
  // The parent is read back through the appview, which is the only read path
  // the client has into a space, and carries the root of its own thread.
  if (isSpaceRecordUri(replyTo)) {
    const post = await fetchCommunityPostView(appviewClient, replyTo)
    const parent = {uri: post.uri, cid: post.cid}
    const root = (
      post.record as {reply?: {root?: {uri?: string; cid?: string}}}
    )?.reply?.root
    return {
      root: root?.uri && root?.cid ? {uri: root.uri, cid: root.cid} : parent,
      parent,
    }
  }

  const replyToUrip = new AtUri(replyTo)

  // Community posts are fetched from the appview, not the standard feed API.
  if (replyToUrip.collection === COMMUNITY_POST_COLLECTION) {
    const res = await communityXrpc(
      appviewClient,
      'community.blacksky.feed.getCommunityPost',
      {params: {uri: replyTo}},
    )
    if (!res.ok) {
      logger.error('Failed to fetch parent community post for reply', {
        uri: replyTo,
      })
      return undefined
    }
    const data = jsonToLex(await res.json()) as {
      post?: {
        uri: string
        cid: string
        record?: app.bsky.feed.post.Main
      }
    }
    if (data.post) {
      const parentRef = {uri: data.post.uri, cid: data.post.cid}
      // A reply inherits its parent's root; the parent is only the root
      // when it is itself a top-level post.
      const parentRootRef = data.post.record?.reply?.root
      const rootRef =
        parentRootRef?.uri && parentRootRef?.cid
          ? {uri: parentRootRef.uri, cid: parentRootRef.cid}
          : parentRef
      return refusePublicSpaceRefs({root: rootRef, parent: parentRef})
    }
    return undefined
  }

  // Standard Bluesky post
  const data = await appviewClient.call(app.bsky.feed.getPosts, {
    uris: [replyTo as AtUriString],
  })
  const parentPost = data.posts[0]
  if (!parentPost) {
    throw new ReplyDeletedError()
  }

  const parentRef = {
    uri: parentPost.uri,
    cid: parentPost.cid,
  }
  let rootRef: com.atproto.repo.strongRef.Main = parentRef

  if (bsky.isType(app.bsky.feed.post, parentPost.record)) {
    if (parentPost.record.reply) {
      rootRef = parentPost.record.reply.root
    }
  }

  return refusePublicSpaceRefs({
    root: rootRef,
    parent: parentRef,
  })
}

export async function resolveEmbed(
  appviewClient: Client,
  chatClient: Client,
  pdsClient: Client,
  queryClient: QueryClient,
  draft: PostDraft,
  onStateChange: ((state: string) => void) | undefined,
): Promise<app.bsky.feed.post.Main['embed']> {
  if (draft.embed.poll) {
    return resolveAssembly(pdsClient, draft, draft.embed.poll, onStateChange)
  }
  if (draft.embed.quote) {
    const [resolvedMedia, resolvedQuote] = await Promise.all([
      resolveMedia(
        appviewClient,
        chatClient,
        pdsClient,
        queryClient,
        draft.embed,
        onStateChange,
      ),
      resolveRecord(
        {appviewClient, chatClient},
        queryClient,
        draft.embed.quote.uri,
      ),
    ])
    if (resolvedMedia) {
      return {
        $type: 'app.bsky.embed.recordWithMedia',
        record: {
          $type: 'app.bsky.embed.record',
          record: resolvedQuote,
        },
        media: resolvedMedia,
      }
    }
    return {
      $type: 'app.bsky.embed.record',
      record: resolvedQuote,
    }
  }
  const resolvedMedia = await resolveMedia(
    appviewClient,
    chatClient,
    pdsClient,
    queryClient,
    draft.embed,
    onStateChange,
  )
  if (resolvedMedia) {
    return resolvedMedia
  }
  if (draft.embed.link) {
    const resolvedLink = await fetchResolveLinkQuery(
      queryClient,
      {appviewClient, chatClient},
      draft.embed.link.uri,
    )
    if (resolvedLink.type === 'record') {
      return {
        $type: 'app.bsky.embed.record',
        record: resolvedLink.record,
      }
    }
  }
  return undefined
}

async function resolveAssembly(
  pdsClient: Client,
  draft: PostDraft,
  poll: PollDraft,
  onStateChange: ((state: string) => void) | undefined,
): Promise<$Typed<app.bsky.embed.external.Main>> {
  refusePollWithAttachments(draft)
  const conversationId = poll.assembly?.conversationId
  if (!conversationId) {
    throw new Error('A poll cannot be posted before its assembly exists')
  }
  return {
    $type: 'app.bsky.embed.external',
    external: {
      ...buildAssemblyExternal({
        conversationId,
        topic: pollTopicFromText(draft.richtext.text),
        statements: pollStatementsForPublish(poll),
      }),
      thumb: await uploadAssemblyThumb(
        pdsClient,
        conversationId,
        onStateChange,
      ),
    },
  }
}

async function uploadEventCover(
  pdsClient: Client,
  cover: EventCover,
  onStateChange: ((state: string) => void) | undefined,
): Promise<{blob: BlobRef; width: number; height: number}> {
  try {
    const image =
      'url' in cover ? (await imageToThumb(cover.url))?.source : cover
    if (!image) throw new Error('The image could not be read')
    onStateChange?.(t`Uploading event image...`)
    const response = await uploadBlob(pdsClient, image.path, image.mime)
    return {blob: response.blob, width: image.width, height: image.height}
  } catch (e) {
    logger.warn(`Failed to upload the event image`, {
      safeMessage: e instanceof Error ? e.message : String(e),
    })
    throw new Error(
      t`Couldn't upload the event image. Try again, or remove the image.`,
    )
  }
}

async function uploadAssemblyThumb(
  pdsClient: Client,
  conversationId: string,
  onStateChange: ((state: string) => void) | undefined,
): Promise<BlobRef | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const thumb = await Promise.race([
      imageToThumb(assemblyThumbUrl(conversationId)),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ASSEMBLY_THUMB_TIMEOUT_MS)
      }),
    ])
    if (!thumb) throw new Error('The image could not be read in time')
    onStateChange?.(t`Uploading link thumbnail...`)
    const {path, mime} = thumb.source
    const response = await uploadBlob(pdsClient, path, mime)
    return response.blob
  } catch (e) {
    logger.warn(`Failed to attach the poll thumbnail`, {
      safeMessage: e instanceof Error ? e.message : String(e),
    })
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

async function resolveMedia(
  appviewClient: Client,
  chatClient: Client,
  pdsClient: Client,
  queryClient: QueryClient,
  embedDraft: EmbedDraft,
  onStateChange: ((state: string) => void) | undefined,
): Promise<
  | $Typed<app.bsky.embed.external.Main>
  | $Typed<app.bsky.embed.images.Main>
  | $Typed<app.bsky.embed.gallery.Main>
  | $Typed<app.bsky.embed.video.Main>
  | undefined
> {
  if (embedDraft.media?.type === 'images') {
    const imagesDraft = embedDraft.media.images
    logger.debug(`Uploading images`, {
      count: imagesDraft.length,
    })
    onStateChange?.(t`Uploading images...`)
    const images: app.bsky.embed.images.Image[] = await Promise.all(
      imagesDraft.map(async (image, i) => {
        logger.debug(`Compressing image #${i}`)
        const {path, width, height, mime} = await compressImage(
          image,
          IMAGE_SIZE_CONFIG_POSTS,
        )
        logger.debug(`Uploading image #${i}`)
        const res = await uploadBlob(pdsClient, path, mime)
        return {
          image: res.blob,
          alt: image.alt,
          aspectRatio: {width, height},
        }
      }),
    )
    return {
      $type: 'app.bsky.embed.images',
      images,
    }
  }
  if (embedDraft.media?.type === 'gallery') {
    const imagesDraft = embedDraft.media.images
    logger.debug(`Uploading images`, {
      count: imagesDraft.length,
    })
    onStateChange?.(t`Uploading images...`)
    const items: $Typed<app.bsky.embed.gallery.Image>[] = await Promise.all(
      imagesDraft.map(async (image, i) => {
        logger.debug(`Compressing image #${i}`)
        const {path, width, height, mime} = await compressImage(
          image,
          IMAGE_SIZE_CONFIG_POSTS,
        )
        logger.debug(`Uploading image #${i}`)
        const res = await uploadBlob(pdsClient, path, mime)
        return {
          $type: 'app.bsky.embed.gallery#image' as const,
          image: res.blob,
          alt: image.alt,
          aspectRatio: {width, height},
        }
      }),
    )
    return {
      $type: 'app.bsky.embed.gallery',
      items,
    }
  }
  if (
    embedDraft.media?.type === 'video' &&
    embedDraft.media.video.status === 'done'
  ) {
    const videoDraft = embedDraft.media.video
    const captions = await Promise.all(
      videoDraft.captions
        .filter(caption => caption.lang !== '')
        .map(async caption => {
          const res = await pdsClient.uploadBlob(caption.file, {
            encoding: 'text/vtt',
          })
          return {lang: caption.lang, file: res.body.blob}
        }),
    )

    // lexicon numbers must be floats
    const width = Math.round(videoDraft.asset.width)
    const height = Math.round(videoDraft.asset.height)

    // aspect ratio values must be >0 - better to leave as unset otherwise
    // posting will fail if aspect ratio is set to 0
    const aspectRatio = width > 0 && height > 0 ? {width, height} : undefined

    if (!aspectRatio) {
      logger.error(
        `Invalid aspect ratio - got { width: ${videoDraft.asset.width}, height: ${videoDraft.asset.height} }`,
      )
    }

    return {
      $type: 'app.bsky.embed.video',
      /*
       * The video blob is a plain lex blob from the video pipeline
       * (getJobStatus, in composer state/video). Its structural shape matches
       * the lexicon blob field and the CID hasher (see computeCid).
       */
      video: videoDraft.pendingPublish.blobRef,
      alt: videoDraft.altText || undefined,
      captions: captions.length === 0 ? undefined : captions,
      aspectRatio,
      presentation:
        videoDraft.video.mimeType === 'image/gif' ? 'gif' : 'default',
    }
  }
  if (embedDraft.media?.type === 'gif') {
    const gifDraft = embedDraft.media
    const resolvedGif = await fetchResolveGifQuery(queryClient, gifDraft.gif)
    let blob: app.bsky.embed.external.External['thumb']
    if (resolvedGif.thumb) {
      onStateChange?.(t`Uploading link thumbnail...`)
      const {path, mime} = resolvedGif.thumb.source
      const response = await uploadBlob(pdsClient, path, mime)
      blob = response.blob
    }
    return {
      $type: 'app.bsky.embed.external',
      external: {
        uri: resolvedGif.uri as UriString,
        title: resolvedGif.title,
        description: createGIFDescription(resolvedGif.title, gifDraft.alt),
        thumb: blob,
      },
    }
  }
  if (embedDraft.link) {
    const resolvedLink = await fetchResolveLinkQuery(
      queryClient,
      {appviewClient, chatClient},
      embedDraft.link.uri,
    )
    if (resolvedLink.type === 'external') {
      let blob: app.bsky.embed.external.External['thumb']
      if (resolvedLink.thumb) {
        onStateChange?.(t`Uploading link thumbnail...`)
        const {path, mime} = resolvedLink.thumb.source
        const response = await uploadBlob(pdsClient, path, mime)
        blob = response.blob
      }
      return {
        $type: 'app.bsky.embed.external',
        external: withCreator(
          {
            uri: resolvedLink.uri as UriString,
            title: resolvedLink.title,
            description: resolvedLink.description,
            thumb: blob,
            associatedRefs: resolvedLink.associatedRefs,
          },
          resolvedLink.authorDid,
        ),
      }
    }
    if (
      resolvedLink.type === 'chat-invite' &&
      bsky.isType(chat.bsky.group.defs.joinLinkPreviewView, resolvedLink.view)
    ) {
      return {
        $type: 'app.bsky.embed.external',
        external: {
          uri: resolvedLink.uri as UriString,
          title: resolvedLink.view.name,
          description: `${resolvedLink.view.memberCount}/${resolvedLink.view.memberLimit}`,
        },
      }
    }
  }
  return undefined
}

async function resolveRecord(
  clients: LinkResolvers,
  queryClient: QueryClient,
  uri: string,
): Promise<com.atproto.repo.strongRef.Main> {
  const resolvedLink = await fetchResolveLinkQuery(queryClient, clients, uri)
  if (resolvedLink.type !== 'record') {
    throw Error(t`Expected uri to resolve to a record`)
  }
  return resolvedLink.record
}
