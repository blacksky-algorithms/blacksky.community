import {type Client, jsonToLex} from '@atproto/lex'
import {AtUri, type AtUriString, type HandleString} from '@atproto/syntax'

import {communityXrpc} from '#/lib/api/community'
import {fetchCommunityPostView} from '#/lib/api/community-post'
import {spacePostUriFromRoute} from '#/lib/api/space-permalink'
import {isSpaceRecordUri} from '#/lib/api/space-uri'
import {IMAGE_SIZE_CONFIG_2K_1MB} from '#/lib/constants'
import {getLinkMeta, type LinkMeta} from '#/lib/link-meta/link-meta'
import {createLinkPreviewTelemetry} from '#/lib/link-meta/linkPreviewTelemetry'
import {resolveShortLink} from '#/lib/link-meta/resolve-short-link'
import {downloadAndResize} from '#/lib/media/manip'
import {
  createStarterPackUri,
  parseStarterPackUri,
} from '#/lib/strings/starter-pack'
import {
  convertBskyAppUrlIfNeeded,
  getChatInviteCodeFromUrl,
  isBskyCustomFeedUrl,
  isBskyListUrl,
  isBskyPostUrl,
  isBskyStarterPackUrl,
  isBskyStartUrl,
  isShortLink,
  makeRecordUri,
} from '#/lib/strings/url-helpers'
import {type ComposerImage} from '#/state/gallery'
import {createComposerImage} from '#/state/gallery'
import {type ChatInvitePreview} from '#/state/queries/join-links'
import {type Gif} from '#/features/gifPicker/types'
import {app, chat, com} from '#/lexicons'
import {createGIFDescription} from '../gif-alt-text'

type ResolvedExternalLink = {
  type: 'external'
  uri: string
  title: string
  description: string
  thumb: ComposerImage | undefined
  authorDid?: string
  /**
   * The AT-URI of the Atmosphere record representing this external content, if
   * it exists. Example: a site.standard.document record.
   */
  associatedRefs?: LinkMeta['associatedRefs']
  view?: LinkMeta['view']
}

type ResolvedPostRecord = {
  type: 'record'
  record: com.atproto.repo.strongRef.Main
  kind: 'post'
  view: app.bsky.feed.defs.PostView
}

type ResolvedFeedRecord = {
  type: 'record'
  record: com.atproto.repo.strongRef.Main
  kind: 'feed'
  view: app.bsky.feed.defs.GeneratorView
}

type ResolvedListRecord = {
  type: 'record'
  record: com.atproto.repo.strongRef.Main
  kind: 'list'
  view: app.bsky.graph.defs.ListView
}

type ResolvedStarterPackRecord = {
  type: 'record'
  record: com.atproto.repo.strongRef.Main
  kind: 'starter-pack'
  view: app.bsky.graph.defs.StarterPackView
}

type ResolvedChatInvite = {
  type: 'chat-invite'
  uri: string
  code: string
  view?: ChatInvitePreview
}

export type ResolvedLink =
  | ResolvedExternalLink
  | ResolvedPostRecord
  | ResolvedFeedRecord
  | ResolvedListRecord
  | ResolvedStarterPackRecord
  | ResolvedChatInvite

export class EmbeddingDisabledError extends Error {
  constructor() {
    super('Embedding is disabled for this record')
  }
}

const COMMUNITY_POST_COLLECTION = 'community.blacksky.feed.post'

// Pull the path portion (without ?query) and the collection from a bsky-style
// post URL. Community posts share the /profile/<x>/post/<rkey> shape with a
// ?collection=community.blacksky.feed.post tail.
function splitPostUrl(url: string): {
  path: string
  collection: string
  space?: string
} {
  const stripped = convertBskyAppUrlIfNeeded(url)
  try {
    const u = new URL(stripped, 'http://_')
    const collection = u.searchParams.get('collection') || 'app.bsky.feed.post'
    const space = u.searchParams.get('space') || undefined
    return {path: u.pathname, collection, space}
  } catch {
    const [path] = stripped.split('?')
    return {path, collection: 'app.bsky.feed.post'}
  }
}

async function getCommunityPost(
  appviewClient: Client,
  uri: string,
): Promise<app.bsky.feed.defs.PostView> {
  // A space record URI is already fully qualified — and would misparse here.
  if (isSpaceRecordUri(uri)) {
    return fetchCommunityPostView(appviewClient, uri)
  }
  const urip = new AtUri(uri)
  if (!urip.host.startsWith('did:')) {
    const data = await appviewClient.call(com.atproto.identity.resolveHandle, {
      handle: urip.host as HandleString,
    })
    urip.host = data.did
  }
  const res = await communityXrpc(
    appviewClient,
    'community.blacksky.feed.getCommunityPost',
    {params: {uri: urip.toString()}},
  )
  if (!res.ok) {
    throw new Error(`getCommunityPost ${res.status}`)
  }
  const data = jsonToLex(await res.json()) as {
    post?: app.bsky.feed.defs.PostView
  }
  if (!data.post) throw new Error('getCommunityPost: post not found')
  return data.post
}

/**
 * The clients a link resolution may need.
 *
 * Everything but the chat-invite branch is an appview read, and the chat invite
 * preview goes through the chat client so it is proxied to the chat service.
 * Both are passed together because the caller cannot know which branch a URL
 * will take until it is parsed.
 */
export type LinkResolvers = {
  appviewClient: Client
  chatClient: Client
}

export async function resolveLink(
  {appviewClient, chatClient}: LinkResolvers,
  uri: string,
): Promise<ResolvedLink> {
  if (isShortLink(uri)) {
    uri = await resolveShortLink(uri)
  }
  if (isBskyPostUrl(uri)) {
    const {path, collection, space} = splitPostUrl(uri)
    const [_0, user, _1, rkey] = path.split('/').filter(Boolean)
    // A `?space=` link addresses a record inside a permissioned space, which
    // is read back through the appview like any other community post.
    const spaceUri = spacePostUriFromRoute(space, user, rkey, collection)
    const recordUri = spaceUri ?? makeRecordUri(user, collection, rkey)
    const post =
      spaceUri || collection === COMMUNITY_POST_COLLECTION
        ? await getCommunityPost(appviewClient, recordUri)
        : await getPost({uri: recordUri})
    if (post.viewer?.embeddingDisabled) {
      throw new EmbeddingDisabledError()
    }
    return {
      type: 'record',
      record: {
        cid: post.cid,
        uri: post.uri,
      },
      kind: 'post',
      view: post,
    }
  }
  if (isBskyCustomFeedUrl(uri)) {
    uri = convertBskyAppUrlIfNeeded(uri)
    const [_0, handleOrDid, _1, rkey] = uri.split('/').filter(Boolean)
    const did = await fetchDid(handleOrDid)
    const feed = makeRecordUri(did, 'app.bsky.feed.generator', rkey)
    const data = await appviewClient.call(app.bsky.feed.getFeedGenerator, {
      feed: feed,
    })
    return {
      type: 'record',
      record: {
        uri: data.view.uri,
        cid: data.view.cid,
      },
      kind: 'feed',
      view: data.view,
    }
  }
  if (isBskyListUrl(uri)) {
    uri = convertBskyAppUrlIfNeeded(uri)
    const [_0, handleOrDid, _1, rkey] = uri.split('/').filter(Boolean)
    const did = await fetchDid(handleOrDid)
    const list = makeRecordUri(did, 'app.bsky.graph.list', rkey)
    const data = await appviewClient.call(app.bsky.graph.getList, {
      list: list,
    })
    return {
      type: 'record',
      record: {
        uri: data.list.uri,
        cid: data.list.cid,
      },
      kind: 'list',
      view: data.list,
    }
  }
  const chatInviteCode = getChatInviteCodeFromUrl(uri)
  if (chatInviteCode) {
    const data = await chatClient.call(chat.bsky.group.getJoinLinkPreviews, {
      codes: [chatInviteCode],
    })
    return {
      type: 'chat-invite',
      uri,
      code: chatInviteCode,
      view: data.joinLinkPreviews[0],
    }
  }
  if (isBskyStartUrl(uri) || isBskyStarterPackUrl(uri)) {
    const parsed = parseStarterPackUri(uri)
    if (!parsed) {
      throw new Error(
        'Unexpectedly called getStarterPackAsEmbed with a non-starterpack url',
      )
    }
    const did = await fetchDid(parsed.name)
    const starterPack = createStarterPackUri({did, rkey: parsed.rkey})
    const data = await appviewClient.call(app.bsky.graph.getStarterPack, {
      starterPack: starterPack as AtUriString,
    })
    return {
      type: 'record',
      record: {
        uri: data.starterPack.uri,
        cid: data.starterPack.cid,
      },
      kind: 'starter-pack',
      view: data.starterPack,
    }
  }
  return resolveExternal(uri)

  // Forked from useGetPost. TODO: move into RQ.
  async function getPost({uri}: {uri: string}) {
    const urip = new AtUri(uri)
    if (!urip.host.startsWith('did:')) {
      const data = await appviewClient.call(
        com.atproto.identity.resolveHandle,
        {handle: urip.host as HandleString},
      )
      urip.host = data.did
    }
    const data = await appviewClient.call(app.bsky.feed.getPosts, {
      uris: [urip.toString()],
    })
    if (data.posts[0]) {
      return data.posts[0]
    }
    throw new Error('getPost: post not found')
  }

  // Forked from useFetchDid. TODO: move into RQ.
  async function fetchDid(handleOrDid: string) {
    let identifier = handleOrDid
    if (!identifier.startsWith('did:')) {
      const data = await appviewClient.call(
        com.atproto.identity.resolveHandle,
        {handle: identifier as HandleString},
      )
      identifier = data.did
    }
    return identifier
  }
}

export async function resolveGif(gif: Gif): Promise<ResolvedExternalLink> {
  const gifUrl = gif.media_formats.gif.url
  const uri = buildGifUri(gif, gifUrl)
  const altText = gif.content_description || gif.title
  return {
    type: 'external',
    uri,
    title: altText,
    description: createGIFDescription(altText),
    thumb: await tryImageToThumb(gif.media_formats.preview.url),
  }
}

async function tryImageToThumb(
  uri: string,
): Promise<ComposerImage | undefined> {
  return await Promise.race([
    imageToThumb(uri),
    new Promise<undefined>(resolve =>
      setTimeout(() => resolve(undefined), 8e3),
    ),
  ])
}

function buildGifUri(gif: Gif, gifUrl: string): string {
  let url: URL
  try {
    url = new URL(gifUrl)
  } catch {
    return gifUrl
  }

  if (url.hostname === 'static.klipy.com') {
    url.searchParams.set('hh', String(gif.media_formats.gif.dims[1]))
    url.searchParams.set('ww', String(gif.media_formats.gif.dims[0]))
    const mp4Slug = getFileSlug(gif.media_formats.mp4?.url)
    const webmSlug = getFileSlug(gif.media_formats.webm?.url)
    if (mp4Slug) url.searchParams.set('mp4', mp4Slug)
    if (webmSlug) url.searchParams.set('webm', webmSlug)
    return url.toString()
  }

  if (/(^|\.)giphy\.com$/.test(url.hostname)) {
    const cleaned = new URL(`https://media.giphy.com${url.pathname}`)
    cleaned.searchParams.set('hh', String(gif.media_formats.gif.dims[1]))
    cleaned.searchParams.set('ww', String(gif.media_formats.gif.dims[0]))
    return cleaned.toString()
  }

  url.searchParams.set('hh', String(gif.media_formats.gif.dims[1]))
  url.searchParams.set('ww', String(gif.media_formats.gif.dims[0]))
  return url.toString()
}

function getFileSlug(url: string | undefined): string | undefined {
  if (!url) return undefined
  const filename = url.split('/').pop()
  if (!filename) return undefined
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 ? filename.slice(0, dotIndex) : undefined
}

function getAuthorDid(author: string | undefined): string | undefined {
  if (!author) return

  try {
    const uri = new AtUri(author)
    if (!uri.host.startsWith('did:') || uri.collection || uri.rkey) return
    return uri.host
  } catch {
    return
  }
}

async function resolveExternal(uri: string): Promise<ResolvedExternalLink> {
  let telemetry: ReturnType<typeof createLinkPreviewTelemetry> | undefined
  try {
    const result = await getLinkMeta(uri, undefined, () => {
      telemetry = createLinkPreviewTelemetry()
      telemetry.startMetadata()
    })
    if (result.error) {
      telemetry?.finishMetadata(false)
      telemetry?.finish('metadata_error')
      throw new Error(result.error)
    }
    telemetry?.finishMetadata(Boolean(result.image))
    if (result.image) {
      telemetry?.startThumbnail()
    }
    const thumb = result.image ? await imageToThumb(result.image) : undefined
    telemetry?.finish(
      result.error
        ? 'metadata_error'
        : !result.image
          ? 'no_image'
          : thumb
            ? 'success'
            : 'thumbnail_error',
    )
    return {
      type: 'external',
      uri: result.url,
      title: result.title ?? '',
      description: result.description ?? '',
      thumb,
      authorDid: getAuthorDid(result.author),
      /*
       * New fields from Standard Site integration. Other fields are derived from
       * opengraph/oembed as before.
       */
      associatedRefs: result.associatedRefs,
      view: result.view,
    }
  } finally {
    telemetry?.finish('error')
  }
}

export async function imageToThumb(
  imageUri: string,
): Promise<ComposerImage | undefined> {
  try {
    const img = await downloadAndResize({
      uri: imageUri,
      ...IMAGE_SIZE_CONFIG_2K_1MB,
      timeout: 15e3,
    })
    if (img) {
      return await createComposerImage(img)
    }
  } catch {}
}
