import {type BlobRef} from '@atproto/api'

export const NSID_DOCUMENT = 'site.standard.document'
export const NSID_PUBLICATION = 'site.standard.publication'
export const NSID_RECOMMEND = 'site.standard.graph.recommend'

export const CONTENT_LEAFLET = 'pub.leaflet.content'
export const CONTENT_OFFPRINT = 'app.offprint.content'
export const CONTENT_PCKT = 'blog.pckt.content'
export const CONTENT_LICHEN_MARKDOWN =
  'net.commoninternet.lichen.content.markdown'

export type FacetIndex = {byteStart: number; byteEnd: number}

export type FacetFeature =
  | {$type: string; uri?: string; did?: string; tag?: string}
  | {$type: string}

export type Facet = {
  index: FacetIndex
  features: FacetFeature[]
}

type CommonTextBlock = {plaintext: string; facets?: Facet[]}

export type LeafletBlock =
  | {$type: 'pub.leaflet.blocks.text'; plaintext: string; facets?: Facet[]}
  | {
      $type: 'pub.leaflet.blocks.header'
      plaintext: string
      level?: number
      facets?: Facet[]
    }
  | {
      $type: 'pub.leaflet.blocks.blockquote'
      plaintext: string
      facets?: Facet[]
    }
  | {
      $type: 'pub.leaflet.blocks.unorderedList'
      content: CommonTextBlock[]
    }
  | {$type: string}

export type LeafletPage = {
  $type: 'pub.leaflet.pages.linearDocument'
  blocks: Array<{
    $type: 'pub.leaflet.pages.linearDocument#block'
    block: LeafletBlock
  }>
}

export type LeafletContent = {
  $type: typeof CONTENT_LEAFLET
  pages: LeafletPage[]
}

export type OffprintBlock =
  | {$type: 'app.offprint.block.text'; plaintext: string; facets?: Facet[]}
  | {
      $type: 'app.offprint.block.heading'
      plaintext: string
      level?: number
      facets?: Facet[]
    }
  | {$type: string}

export type OffprintContent = {
  $type: typeof CONTENT_OFFPRINT
  items: OffprintBlock[]
}

export type PcktImageAttrs = {
  alt?: string
  blob: BlobRef
  src?: string
  width?: string
  align?: string
}

export type PcktBlock =
  | {$type: 'blog.pckt.block.text'; plaintext: string; facets?: Facet[]}
  | {$type: 'blog.pckt.block.image'; attrs: PcktImageAttrs}
  | {
      $type: 'blog.pckt.block.taskList'
      content: Array<{
        $type: 'blog.pckt.block.taskItem'
        checked: boolean
        content: PcktBlock[]
      }>
    }
  | {
      $type: 'blog.pckt.block.orderedList'
      content: Array<{
        $type: 'blog.pckt.block.listItem'
        content: PcktBlock[]
      }>
    }
  | {
      $type: 'blog.pckt.block.blockquote'
      content: PcktBlock[]
    }
  | {$type: string}

export type PcktContent = {
  $type: typeof CONTENT_PCKT
  items: PcktBlock[]
}

export type LichenMarkdownContent = {
  $type: typeof CONTENT_LICHEN_MARKDOWN
  text: string
}

export type DocumentContent =
  | LeafletContent
  | OffprintContent
  | PcktContent
  | LichenMarkdownContent
  | {$type: string}

export type StandardDocumentRecord = {
  $type?: typeof NSID_DOCUMENT
  site: string
  path?: string
  title: string
  description?: string
  coverImage?: BlobRef
  textContent?: string
  content?: DocumentContent
  tags?: string[]
  publishedAt: string
  updatedAt?: string
  bskyPostRef?: {
    uri: string
    cid: string
  }
}

export type StandardRecommendRecord = {
  $type?: typeof NSID_RECOMMEND
  document: string
  createdAt: string
}

export function parseStandardDocumentUri(
  uri: string | undefined,
): {repo: string; rkey: string} | undefined {
  if (!uri) return undefined
  if (!uri.startsWith('at://')) return undefined
  const rest = uri.slice('at://'.length)
  const parts = rest.split('/')
  if (parts.length !== 3) return undefined
  const [repo, collection, rkey] = parts
  if (collection !== NSID_DOCUMENT) return undefined
  if (!repo || !rkey) return undefined
  return {repo, rkey}
}

export function blobRefCid(blob: BlobRef | undefined): string | undefined {
  if (!blob) return undefined
  const ref: unknown = (blob as {ref?: unknown}).ref
  if (!ref) return undefined
  if (typeof ref === 'string') return ref
  if (typeof ref === 'object') {
    const link = (ref as {$link?: unknown}).$link
    if (typeof link === 'string') return link
    if (typeof (ref as {toString?: () => string}).toString === 'function') {
      const s = (ref as {toString: () => string}).toString()
      if (s && s !== '[object Object]') return s
    }
  }
  return undefined
}

export function parseStandardPublicationUri(
  uri: string | undefined,
): {repo: string; rkey: string} | undefined {
  if (!uri) return undefined
  if (!uri.startsWith('at://')) return undefined
  const rest = uri.slice('at://'.length)
  const parts = rest.split('/')
  if (parts.length !== 3) return undefined
  const [repo, collection, rkey] = parts
  if (collection !== NSID_PUBLICATION) return undefined
  if (!repo || !rkey) return undefined
  return {repo, rkey}
}
