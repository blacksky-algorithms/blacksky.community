import {type ImagePickerAsset} from 'expo-image-picker'
import {
  type AppBskyActorDefs,
  type AppBskyDraftDefs,
  type AppBskyFeedPostgate,
  AppBskyRichtextFacet,
  RichText,
} from '@atproto/api'
import {nanoid} from 'nanoid/non-secure'

import {
  type CommunityFeedTarget,
  isSpaceBackedFeed,
} from '#/lib/api/community-feed'
import {isCommunityPostUri} from '#/lib/api/community-post'
import {
  type AssemblyRef,
  isPollDraftPublishable,
  isPollTopicPublishable,
  POLL_MAX_STATEMENTS,
  type PollDraft,
} from '#/lib/api/poll'
import {isSpacePostUrl} from '#/lib/api/space-permalink'
import {type SelfLabel} from '#/lib/moderation'
import {insertMentionAt} from '#/lib/strings/mention-manip'
import {shortenLinks} from '#/lib/strings/rich-text-manip'
import {
  isBskyPostUrl,
  postUriToRelativePath,
  toBskyAppUrl,
} from '#/lib/strings/url-helpers'
import {logger} from '#/logger'
import {type ComposerImage, createInitialImages} from '#/state/gallery'
import {createPostgateRecord} from '#/state/queries/postgate/util'
import {threadgateRecordToAllowUISetting} from '#/state/queries/threadgate'
import {type ThreadgateAllowUISetting} from '#/state/queries/threadgate'
import {type ComposerOpts} from '#/state/shell/composer'
import {
  type LinkFacetMatch,
  suggestLinkCardUri,
} from '#/view/com/composer/text-input/text-input-util'
import {type Gif} from '#/features/gifPicker/types'
import {
  createVideoState,
  type VideoAction,
  videoReducer,
  type VideoState,
} from './video'

type ImagesMedia = {
  type: 'images'
  images: ComposerImage[]
}

type GalleryMedia = {
  type: 'gallery'
  images: ComposerImage[]
}

type VideoMedia = {
  type: 'video'
  video: VideoState
}

type GifMedia = {
  type: 'gif'
  gif: Gif
  alt: string
}

type Link = {
  type: 'link'
  uri: string
}

// This structure doesn't exactly correspond to the data model.
// Instead, it maps to how the UI is organized, and how we present a post.
export type EmbedDraft = {
  // We'll always submit quote and actual media (images, video, gifs) chosen by the user.
  quote: Link | undefined
  media: ImagesMedia | GalleryMedia | VideoMedia | GifMedia | undefined
  // This field may end up ignored if we have more important things to display than a link card:
  link: Link | undefined
  poll?: PollDraft
}

export type PostDraft = {
  id: string
  richtext: RichText
  labels: SelfLabel[]
  embed: EmbedDraft
  shortenedGraphemeLength: number
}

export type PostAction =
  | {type: 'update_richtext'; richtext: RichText}
  | {type: 'update_labels'; labels: SelfLabel[]}
  | {type: 'embed_add_images'; images: ComposerImage[]}
  | {type: 'embed_update_image'; image: ComposerImage}
  | {type: 'embed_remove_image'; image: ComposerImage}
  | {
      type: 'embed_add_video'
      asset: ImagePickerAsset
      abortController: AbortController
    }
  | {type: 'embed_remove_video'}
  | {type: 'embed_update_video'; videoAction: VideoAction}
  | {type: 'embed_add_uri'; uri: string}
  | {type: 'embed_remove_quote'}
  | {type: 'embed_remove_link'}
  | {type: 'embed_add_gif'; gif: Gif}
  | {type: 'embed_update_gif'; alt: string}
  | {type: 'embed_remove_gif'}
  | {type: 'embed_add_poll'}
  | {type: 'embed_update_poll_statement'; index: number; text: string}
  | {type: 'embed_add_poll_statement'}
  | {type: 'embed_remove_poll_statement'; index: number}
  | {type: 'embed_set_poll_assembly'; assembly: AssemblyRef}
  | {type: 'embed_remove_poll'}

export function postHasAttachment(post: PostDraft): boolean {
  return Boolean(
    post.embed.media || post.embed.link || post.embed.quote || post.embed.poll,
  )
}

export function postHasContent(post: PostDraft): boolean {
  return post.richtext.text.trim().length > 0 || postHasAttachment(post)
}

export function isPollPostable(post: PostDraft): boolean {
  const poll = post.embed.poll
  if (!poll) return true
  return (
    isPollTopicPublishable(post.richtext.text) &&
    isPollDraftPublishable(poll) &&
    !post.embed.media &&
    !post.embed.link &&
    !post.embed.quote
  )
}

export type ThreadDraft = {
  posts: PostDraft[]
  postgate: AppBskyFeedPostgate.Record
  threadgate: ThreadgateAllowUISetting[]
  blackskyOnly: boolean
  communityFeed?: CommunityFeedTarget
  communityFeedUri?: string
  /**
   * The space a parent post lives in, inherited when replying to or quoting
   * one. Distinct from `communityFeedUri`, which names a feed the author
   * chose to post into: a space is where content goes, a feed is a view.
   */
  communitySpaceUri?: string
}

export type ComposerState = {
  thread: ThreadDraft
  activePostIndex: number
  mutableNeedsFocusActive: boolean
  /** ID of the draft being edited, if any. Used to update existing draft on save. */
  draftId?: string
  /** Whether the composer has been modified since loading a draft. */
  isDirty: boolean
  /** Map of localId -> loaded media path/URL for the current draft. Used for re-saving without re-copying media. */
  loadedMediaMap?: Map<string, string>
  /** Set of original localRef paths from the draft being edited. Used to identify orphaned media on save. */
  originalLocalRefs?: Set<string>
}

export type ComposerAction =
  | {type: 'update_postgate'; postgate: AppBskyFeedPostgate.Record}
  | {type: 'update_threadgate'; threadgate: ThreadgateAllowUISetting[]}
  | {type: 'toggle_blacksky_only'}
  | {
      type: 'set_post_target'
      target: 'public' | 'blacksky' | CommunityFeedTarget
    }
  | {
      type: 'update_post'
      postId: string
      postAction: PostAction
    }
  | {
      type: 'add_post'
    }
  | {
      type: 'remove_post'
      postId: string
    }
  | {
      type: 'focus_post'
      postId: string
    }
  | {
      type: 'restore_from_draft'
      draftId: string
      posts: PostDraft[]
      threadgateAllow: AppBskyDraftDefs.Draft['threadgateAllow']
      postgateEmbeddingRules: AppBskyDraftDefs.Draft['postgateEmbeddingRules']

      /** Map of localRefPath -> loaded media path/URL */
      loadedMedia: Map<string, string>
      /** Set of original localRef paths from the draft. Used to identify orphaned media on save. */
      originalLocalRefs: Set<string>
    }
  | {
      type: 'clear'
      initInteractionSettings:
        | AppBskyActorDefs.PostInteractionSettingsPref
        | undefined
    }
  | {
      type: 'mark_saved'
      draftId: string
    }

function hasSpaceVideoTarget(thread: ThreadDraft): boolean {
  return (
    !!thread.communitySpaceUri ||
    isSpaceBackedFeed(thread.communityFeed?.config)
  )
}

function isPublicFeedTarget(thread: ThreadDraft): boolean {
  const feed = thread.communityFeed
  if (!feed) {
    // A feed known only by its URI is resolved at publish, so until then
    // nothing shows that it is public.
    return !thread.communityFeedUri
  }
  return (
    feed.config.contentType === 'publicRecord' &&
    !isSpaceBackedFeed(feed.config)
  )
}

function isCommunityQuote(uri: string | undefined): boolean {
  return isCommunityPostUri(uri) || isSpacePostUrl(uri)
}

export function isPublicTarget(thread: ThreadDraft): boolean {
  return (
    !thread.blackskyOnly &&
    !thread.communitySpaceUri &&
    isPublicFeedTarget(thread)
  )
}

export function isPollAllowed(
  thread: ThreadDraft,
  replyTo: string | undefined,
): boolean {
  return (
    isPublicTarget(thread) &&
    !isCommunityPostUri(replyTo) &&
    !thread.posts.some(post => isCommunityQuote(post.embed.quote?.uri))
  )
}

export function threadHasPoll(thread: ThreadDraft): boolean {
  return thread.posts.some(post => post.embed.poll)
}

function keepFirstPoll(posts: PostDraft[]): PostDraft[] {
  const first = posts.findIndex(post => post.embed.poll)
  return posts.map((post, index) =>
    post.embed.poll && index !== first
      ? postReducer(post, {type: 'embed_remove_poll'})
      : post,
  )
}

function applyTargetChange(
  state: ComposerState,
  nextThread: ThreadDraft,
): ComposerState {
  const clearVideos =
    hasSpaceVideoTarget(state.thread) !== hasSpaceVideoTarget(nextThread)
  const clearPolls = threadHasPoll(nextThread) && !isPublicTarget(nextThread)
  if (!clearVideos && !clearPolls) {
    return {
      ...state,
      isDirty: true,
      thread: nextThread,
    }
  }

  const posts = state.thread.posts.map(post => {
    const withoutVideo =
      clearVideos && post.embed.media?.type === 'video'
        ? postReducer(post, {type: 'embed_remove_video'})
        : post
    return clearPolls && withoutVideo.embed.poll
      ? postReducer(withoutVideo, {type: 'embed_remove_poll'})
      : withoutVideo
  })
  return {
    ...state,
    isDirty: true,
    thread: {...nextThread, posts},
  }
}

/**
 * Threshold for picking between embed variants. <= this count uses the
 * legacy `app.bsky.embed.images` shape; > this count promotes to
 * `app.bsky.embed.gallery`. Named to flag that if/when we deprecate the
 * legacy images embed entirely, this constant (and the variant split it
 * gates) should go away.
 */
export const LEGACY_IMAGES_EMBED_MAX = 4
export const MAX_GALLERY_IMAGES = 10

/**
 * Picks the embed variant for a set of images. <=4 lands in the legacy
 * `app.bsky.embed.images` shape; >4 promotes to `app.bsky.embed.gallery`.
 * Anything beyond the gallery cap is dropped by the hard slice; callers
 * should already have enforced the cap upstream (picker, paste, etc),
 * and the reducer logs a warning when the cap is exceeded so the UI
 * layer can surface a toast.
 */
function imagesToMediaVariant(
  images: ComposerImage[],
): ImagesMedia | GalleryMedia {
  return images.length <= LEGACY_IMAGES_EMBED_MAX
    ? {type: 'images', images: images.slice(0, LEGACY_IMAGES_EMBED_MAX)}
    : {type: 'gallery', images: images.slice(0, MAX_GALLERY_IMAGES)}
}

export function composerReducer(
  state: ComposerState,
  action: ComposerAction,
): ComposerState {
  switch (action.type) {
    case 'update_postgate': {
      return {
        ...state,
        isDirty: true,
        thread: {
          ...state.thread,
          postgate: action.postgate,
        },
      }
    }
    case 'update_threadgate': {
      return {
        ...state,
        isDirty: true,
        thread: {
          ...state.thread,
          threadgate: action.threadgate,
        },
      }
    }
    case 'toggle_blacksky_only': {
      const nextThread = {
        ...state.thread,
        blackskyOnly: !state.thread.blackskyOnly,
        communityFeed: undefined,
        communityFeedUri: undefined,
        communitySpaceUri: undefined,
      }
      return applyTargetChange(
        {
          ...state,
        },
        nextThread,
      )
    }
    case 'set_post_target': {
      const nextThread = {
        ...state.thread,
        blackskyOnly: action.target === 'blacksky',
        communityFeed:
          typeof action.target === 'string' ? undefined : action.target,
        communityFeedUri:
          typeof action.target === 'string' ? undefined : action.target.feed,
      }
      return applyTargetChange(
        {
          ...state,
        },
        nextThread,
      )
    }
    case 'update_post': {
      if (
        action.postAction.type === 'embed_add_poll' &&
        (threadHasPoll(state.thread) || !isPollAllowed(state.thread, undefined))
      ) {
        return state
      }
      let nextPosts = state.thread.posts
      const postIndex = state.thread.posts.findIndex(
        p => p.id === action.postId,
      )
      if (postIndex !== -1) {
        nextPosts = state.thread.posts.slice()
        nextPosts[postIndex] = postReducer(
          state.thread.posts[postIndex],
          action.postAction,
        )
      }
      return {
        ...state,
        isDirty: true,
        thread: {
          ...state.thread,
          posts: nextPosts,
        },
      }
    }
    case 'add_post': {
      const activePostIndex = state.activePostIndex
      const nextPosts = [...state.thread.posts]
      nextPosts.splice(activePostIndex + 1, 0, {
        id: nanoid(),
        richtext: new RichText({text: ''}),
        shortenedGraphemeLength: 0,
        labels: [],
        embed: {
          quote: undefined,
          media: undefined,
          link: undefined,
        },
      })
      return {
        ...state,
        isDirty: true,
        thread: {
          ...state.thread,
          posts: nextPosts,
        },
      }
    }
    case 'remove_post': {
      if (state.thread.posts.length < 2) {
        return state
      }
      let nextActivePostIndex = state.activePostIndex
      const indexToRemove = state.thread.posts.findIndex(
        p => p.id === action.postId,
      )
      let nextPosts = [...state.thread.posts]
      if (indexToRemove !== -1) {
        const postToRemove = state.thread.posts[indexToRemove]
        if (postToRemove.embed.media?.type === 'video') {
          postToRemove.embed.media.video.abortController.abort()
        }
        nextPosts.splice(indexToRemove, 1)
        nextActivePostIndex = Math.max(0, indexToRemove - 1)
      }
      return {
        ...state,
        isDirty: true,
        activePostIndex: nextActivePostIndex,
        mutableNeedsFocusActive: true,
        thread: {
          ...state.thread,
          posts: nextPosts,
        },
      }
    }
    case 'focus_post': {
      const nextActivePostIndex = state.thread.posts.findIndex(
        p => p.id === action.postId,
      )
      if (nextActivePostIndex === -1) {
        return state
      }
      return {
        ...state,
        activePostIndex: nextActivePostIndex,
      }
    }
    case 'restore_from_draft': {
      const {
        draftId,
        posts,
        threadgateAllow,
        postgateEmbeddingRules,
        loadedMedia,
        originalLocalRefs,
      } = action

      return {
        activePostIndex: 0,
        mutableNeedsFocusActive: true,
        draftId,
        isDirty: false,
        loadedMediaMap: loadedMedia,
        originalLocalRefs,
        thread: {
          posts: keepFirstPoll(posts),
          postgate: createPostgateRecord({
            post: '',
            embeddingRules: postgateEmbeddingRules,
          }),
          threadgate: threadgateRecordToAllowUISetting({
            $type: 'app.bsky.feed.threadgate',
            post: '',
            createdAt: new Date().toString(),
            allow: threadgateAllow,
          }),
          blackskyOnly: false,
        },
      }
    }
    case 'clear': {
      return createComposerState({
        initText: undefined,
        initMention: undefined,
        initImageUris: [],
        initQuoteUri: undefined,
        initInteractionSettings: action.initInteractionSettings,
      })
    }
    case 'mark_saved': {
      return {
        ...state,
        isDirty: false,
        draftId: action.draftId,
      }
    }
  }
}

function postReducer(state: PostDraft, action: PostAction): PostDraft {
  switch (action.type) {
    case 'update_richtext': {
      return {
        ...state,
        richtext: action.richtext,
        shortenedGraphemeLength: getShortenedLength(action.richtext),
      }
    }
    case 'update_labels': {
      return {
        ...state,
        labels: action.labels,
      }
    }
    case 'embed_add_images': {
      if (action.images.length === 0 || state.embed.poll) {
        return state
      }
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      const prevCount =
        prevMedia?.type === 'images' || prevMedia?.type === 'gallery'
          ? prevMedia.images.length
          : 0
      const incomingCount = prevCount + action.images.length
      if (incomingCount > MAX_GALLERY_IMAGES) {
        // Defense in depth: callers (applyGalleryCap in Composer) should have
        // already trimmed and surfaced a toast. The hard slice in
        // imagesToMediaVariant still drops the excess so the cap holds.
        logger.warn('composer: image add exceeds MAX_GALLERY_IMAGES', {
          prevCount,
          incomingCount,
          dropped: incomingCount - MAX_GALLERY_IMAGES,
        })
      }
      if (!prevMedia) {
        nextMedia = imagesToMediaVariant(action.images)
      } else if (prevMedia.type === 'images' || prevMedia.type === 'gallery') {
        nextMedia = imagesToMediaVariant([
          ...prevMedia.images,
          ...action.images,
        ])
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_update_image': {
      const prevMedia = state.embed.media
      if (prevMedia?.type === 'images' || prevMedia?.type === 'gallery') {
        const updatedImage = action.image
        const nextMedia = {
          ...prevMedia,
          images: prevMedia.images.map(img => {
            if (img.source.id === updatedImage.source.id) {
              return updatedImage
            }
            return img
          }),
        }
        return {
          ...state,
          embed: {
            ...state.embed,
            media: nextMedia,
          },
        }
      }
      return state
    }
    case 'embed_remove_image': {
      const prevMedia = state.embed.media
      if (prevMedia?.type === 'images' || prevMedia?.type === 'gallery') {
        const removedImage = action.image
        const remainingImages = prevMedia.images.filter(img => {
          return img.source.id !== removedImage.source.id
        })
        let nextMedia: ImagesMedia | GalleryMedia | undefined
        if (remainingImages.length === 0) {
          nextMedia = undefined
        } else {
          // Re-pick the variant so a gallery that shrinks to <=4 demotes
          // back to the legacy `app.bsky.embed.images` shape - keeps old
          // clients rendering it when possible.
          nextMedia = imagesToMediaVariant(remainingImages)
        }
        return {
          ...state,
          embed: {
            ...state.embed,
            media: nextMedia,
          },
        }
      }
      return state
    }
    case 'embed_add_video': {
      if (state.embed.poll) {
        return state
      }
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (!prevMedia) {
        nextMedia = {
          type: 'video',
          video: createVideoState(action.asset, action.abortController),
        }
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_update_video': {
      const videoAction = action.videoAction
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (prevMedia?.type === 'video') {
        nextMedia = {
          ...prevMedia,
          video: videoReducer(prevMedia.video, videoAction),
        }
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_remove_video': {
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (prevMedia?.type === 'video') {
        prevMedia.video.abortController.abort()
        nextMedia = undefined
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_add_uri': {
      if (state.embed.poll) {
        return state
      }
      const prevQuote = state.embed.quote
      const prevLink = state.embed.link
      let nextQuote = prevQuote
      let nextLink = prevLink
      if (isBskyPostUrl(action.uri)) {
        if (!prevQuote) {
          nextQuote = {
            type: 'link',
            uri: action.uri,
          }
        }
      } else {
        if (!prevLink) {
          nextLink = {
            type: 'link',
            uri: action.uri,
          }
        }
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          quote: nextQuote,
          link: nextLink,
        },
      }
    }
    case 'embed_remove_link': {
      return {
        ...state,
        embed: {
          ...state.embed,
          link: undefined,
        },
      }
    }
    case 'embed_remove_quote': {
      return {
        ...state,
        embed: {
          ...state.embed,
          quote: undefined,
        },
      }
    }
    case 'embed_add_gif': {
      if (state.embed.poll) {
        return state
      }
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (!prevMedia) {
        nextMedia = {
          type: 'gif',
          gif: action.gif,
          alt: '',
        }
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_update_gif': {
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (prevMedia?.type === 'gif') {
        nextMedia = {
          ...prevMedia,
          alt: action.alt,
        }
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_remove_gif': {
      const prevMedia = state.embed.media
      let nextMedia = prevMedia
      if (prevMedia?.type === 'gif') {
        nextMedia = undefined
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          media: nextMedia,
        },
      }
    }
    case 'embed_add_poll': {
      if (postHasAttachment(state)) {
        return state
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: {statements: ['']},
        },
      }
    }
    case 'embed_update_poll_statement': {
      const poll = state.embed.poll
      if (!poll || action.index < 0 || action.index >= poll.statements.length) {
        return state
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: {
            ...poll,
            statements: poll.statements.map((text, i) =>
              i === action.index ? action.text : text,
            ),
          },
        },
      }
    }
    case 'embed_add_poll_statement': {
      const poll = state.embed.poll
      if (!poll || poll.statements.length >= POLL_MAX_STATEMENTS) {
        return state
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: {...poll, statements: [...poll.statements, '']},
        },
      }
    }
    case 'embed_remove_poll_statement': {
      const poll = state.embed.poll
      if (!poll || poll.statements.length <= 1) {
        return state
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: {
            ...poll,
            statements: poll.statements.filter((_, i) => i !== action.index),
          },
        },
      }
    }
    case 'embed_set_poll_assembly': {
      const poll = state.embed.poll
      if (!poll) {
        return state
      }
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: {...poll, assembly: action.assembly},
        },
      }
    }
    case 'embed_remove_poll': {
      return {
        ...state,
        embed: {
          ...state.embed,
          poll: undefined,
        },
      }
    }
  }
}

export function createComposerState({
  initText,
  initMention,
  initImageUris,
  initQuoteUri,
  initInteractionSettings,
  initBlackskyOnly,
  initCommunitySpaceUri,
}: {
  initText: string | undefined
  initMention: string | undefined
  initImageUris: ComposerOpts['imageUris']
  initQuoteUri: string | undefined
  initInteractionSettings:
    | AppBskyActorDefs.PostInteractionSettingsPref
    | undefined
  initBlackskyOnly?: boolean
  initCommunitySpaceUri?: string
}): ComposerState {
  let media: ImagesMedia | GalleryMedia | undefined
  if (initImageUris?.length) {
    media = imagesToMediaVariant(createInitialImages(initImageUris))
  }
  let quote: Link | undefined
  if (initQuoteUri) {
    // TODO: Consider passing the app url directly.
    const path = postUriToRelativePath(initQuoteUri)
    if (path) {
      quote = {
        type: 'link',
        uri: toBskyAppUrl(path),
      }
    }
  }
  const initRichText = new RichText({
    text: initText
      ? initText
      : initMention
        ? insertMentionAt(
            `@${initMention}`,
            initMention.length + 1,
            `${initMention}`,
          )
        : '',
  })

  let link: Link | undefined

  /**
   * `initText` atm is only used for compose intents, meaning share links from
   * external sources. If `initText` is defined, we want to extract links/posts
   * from `initText` and suggest them as embeds.
   *
   * This checks for posts separately from other types of links so that posts
   * can become quotes. The util `suggestLinkCardUri` is then applied to ensure
   * we suggest at most 1 of each.
   */
  if (initText) {
    initRichText.detectFacetsWithoutResolution()
    const detectedExtUris = new Map<string, LinkFacetMatch>()
    const detectedPostUris = new Map<string, LinkFacetMatch>()
    if (initRichText.facets) {
      for (const facet of initRichText.facets) {
        for (const feature of facet.features) {
          if (AppBskyRichtextFacet.isLink(feature)) {
            if (isBskyPostUrl(feature.uri)) {
              detectedPostUris.set(feature.uri, {facet, rt: initRichText})
            } else {
              detectedExtUris.set(feature.uri, {facet, rt: initRichText})
            }
          }
        }
      }
    }
    const pastSuggestedUris = new Set<string>()
    const suggestedExtUri = suggestLinkCardUri(
      true,
      detectedExtUris,
      new Map(),
      pastSuggestedUris,
    )
    if (suggestedExtUri) {
      link = {
        type: 'link',
        uri: suggestedExtUri,
      }
    }
    const suggestedPostUri = suggestLinkCardUri(
      true,
      detectedPostUris,
      new Map(),
      pastSuggestedUris,
    )
    if (suggestedPostUri) {
      /*
       * `initQuote` is only populated via in-app user action, but we're being
       * future-defensive here.
       */
      if (!quote) {
        quote = {
          type: 'link',
          uri: suggestedPostUri,
        }
      }
    }
  } else if (initMention) {
    // highlight the mention
    initRichText.detectFacetsWithoutResolution()
  }

  return {
    activePostIndex: 0,
    mutableNeedsFocusActive: false,
    isDirty: false,
    thread: {
      posts: [
        {
          id: nanoid(),
          richtext: initRichText,
          shortenedGraphemeLength: getShortenedLength(initRichText),
          labels: [],
          embed: {
            quote,
            media,
            link,
          },
        },
      ],
      postgate: createPostgateRecord({
        post: '',
        embeddingRules: initInteractionSettings?.postgateEmbeddingRules || [],
      }),
      threadgate: threadgateRecordToAllowUISetting({
        $type: 'app.bsky.feed.threadgate',
        post: '',
        createdAt: new Date().toString(),
        allow: initInteractionSettings?.threadgateAllowRules,
      }),
      blackskyOnly: !!initBlackskyOnly,
      communitySpaceUri: initCommunitySpaceUri,
    },
  }
}

function getShortenedLength(rt: RichText) {
  return shortenLinks(rt).graphemeLength
}
