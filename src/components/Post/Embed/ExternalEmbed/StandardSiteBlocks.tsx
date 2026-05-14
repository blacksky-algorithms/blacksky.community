import {Fragment} from 'react'
import {Linking, View} from 'react-native'
import {Image} from 'expo-image'
// eslint-disable-next-line import-x/no-extraneous-dependencies
const MarkdownIt = require('markdown-it') as new (opts?: {
  html?: boolean
  linkify?: boolean
  breaks?: boolean
}) => {
  parse(
    src: string,
    env: object,
  ): Array<{
    type: string
    tag: string
    content: string
    children?: Array<{
      type: string
      content?: string
      attrs?: Array<[string, string]>
    }> | null
    attrs?: Array<[string, string]>
  }>
}

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {
  blobRefCid,
  CONTENT_LEAFLET,
  CONTENT_LICHEN_MARKDOWN,
  CONTENT_OFFPRINT,
  CONTENT_PCKT,
  type DocumentContent,
  type Facet,
  type LeafletBlock,
  type OffprintBlock,
  type PcktBlock,
  type StandardDocumentRecord,
} from '#/types/standard-site'
import {splitByFacets} from '#/types/standard-site-facets'

type RenderCtx = {
  authorDid: string
}

export function DocumentBody({
  document,
  ctx,
}: {
  document: StandardDocumentRecord
  ctx: RenderCtx
}) {
  const content = document.content
  if (!content || typeof (content as {$type?: string}).$type !== 'string') {
    return <PlaintextFallback text={document.textContent} />
  }
  const $type = content.$type
  switch ($type) {
    case CONTENT_LEAFLET:
      return renderLeafletPages(content)
    case CONTENT_OFFPRINT:
      return renderOffprintItems(content)
    case CONTENT_PCKT:
      return renderPcktItems(content, ctx)
    case CONTENT_LICHEN_MARKDOWN: {
      const md = (content as {text?: string}).text ?? document.textContent
      if (!md) return null
      const normalized = md.replace(/<br\s*\/?>/gi, '\n\n')
      return <MarkdownBody text={normalized} />
    }
    default:
      return <PlaintextFallback text={document.textContent} />
  }
}

function PlaintextFallback({text}: {text: string | undefined}) {
  if (!text) return null
  const paragraphs = text.split(/\n{2,}/g)
  return (
    <View style={[a.gap_sm]}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={[a.text_md, a.leading_normal]}>
          {p}
        </Text>
      ))}
    </View>
  )
}

function renderLeafletPages(content: DocumentContent) {
  const pages = (content as {pages?: Array<{blocks?: unknown[]}>}).pages ?? []
  return (
    <View style={[a.gap_sm]}>
      {pages.flatMap((page, pi) => {
        const wrappers = (page.blocks ?? []) as Array<{block?: LeafletBlock}>
        return wrappers.map((w, bi) =>
          w.block ? (
            <LeafletBlockNode key={`${pi}-${bi}`} block={w.block} />
          ) : null,
        )
      })}
    </View>
  )
}

function renderOffprintItems(content: DocumentContent) {
  const items = (content as {items?: OffprintBlock[]}).items ?? []
  return (
    <View style={[a.gap_sm]}>
      {items.map((item, i) => (
        <OffprintBlockNode key={i} block={item} />
      ))}
    </View>
  )
}

function renderPcktItems(content: DocumentContent, ctx: RenderCtx) {
  const items = (content as {items?: PcktBlock[]}).items ?? []
  return (
    <View style={[a.gap_sm]}>
      {items.map((item, i) => (
        <PcktBlockNode key={i} block={item} ctx={ctx} />
      ))}
    </View>
  )
}

function LeafletBlockNode({block}: {block: LeafletBlock}) {
  const t = useTheme()
  switch (block.$type) {
    case 'pub.leaflet.blocks.text':
      return (
        <Text style={[a.text_md, a.leading_normal]}>
          <FacetSpans
            plaintext={(block as {plaintext?: string}).plaintext ?? ''}
            facets={(block as {facets?: Facet[]}).facets}
          />
        </Text>
      )
    case 'pub.leaflet.blocks.header':
      return (
        <Text style={[a.text_xl, a.font_bold, a.leading_tight, a.mt_sm]}>
          <FacetSpans
            plaintext={(block as {plaintext?: string}).plaintext ?? ''}
            facets={(block as {facets?: Facet[]}).facets}
          />
        </Text>
      )
    case 'pub.leaflet.blocks.blockquote':
      return (
        <View
          style={[
            a.pl_md,
            {
              borderLeftWidth: 3,
              borderLeftColor: t.atoms.border_contrast_medium.borderColor,
            },
          ]}>
          <Text
            style={[
              a.text_md,
              a.leading_normal,
              a.italic,
              t.atoms.text_contrast_high,
            ]}>
            <FacetSpans
              plaintext={(block as {plaintext?: string}).plaintext ?? ''}
              facets={(block as {facets?: Facet[]}).facets}
            />
          </Text>
        </View>
      )
    case 'pub.leaflet.blocks.unorderedList': {
      const items =
        (block as {content?: Array<{plaintext?: string; facets?: Facet[]}>})
          .content ?? []
      return (
        <View style={[a.gap_xs]}>
          {items.map((it, i) => (
            <View key={i} style={[a.flex_row, a.gap_sm]}>
              <Text style={[a.text_md]}>•</Text>
              <Text style={[a.flex_1, a.text_md, a.leading_normal]}>
                <FacetSpans plaintext={it.plaintext ?? ''} facets={it.facets} />
              </Text>
            </View>
          ))}
        </View>
      )
    }
    default:
      return (
        <Text style={[a.text_md, a.leading_normal, t.atoms.text_contrast_low]}>
          {(block as {plaintext?: string}).plaintext ?? ''}
        </Text>
      )
  }
}

function OffprintBlockNode({block}: {block: OffprintBlock}) {
  const t = useTheme()
  switch (block.$type) {
    case 'app.offprint.block.text':
      return (
        <Text style={[a.text_md, a.leading_normal]}>
          <FacetSpans
            plaintext={(block as {plaintext?: string}).plaintext ?? ''}
            facets={(block as {facets?: Facet[]}).facets}
          />
        </Text>
      )
    case 'app.offprint.block.heading': {
      const level = (block as {level?: number}).level ?? 2
      const sizeStyle = level === 1 ? a.text_2xl : a.text_xl
      return (
        <Text style={[sizeStyle, a.font_bold, a.leading_tight, a.mt_sm]}>
          <FacetSpans
            plaintext={(block as {plaintext?: string}).plaintext ?? ''}
            facets={(block as {facets?: Facet[]}).facets}
          />
        </Text>
      )
    }
    default:
      return (
        <Text style={[a.text_md, a.leading_normal, t.atoms.text_contrast_low]}>
          {(block as {plaintext?: string}).plaintext ?? ''}
        </Text>
      )
  }
}

function PcktBlockNode({block, ctx}: {block: PcktBlock; ctx: RenderCtx}) {
  const t = useTheme()
  switch (block.$type) {
    case 'blog.pckt.block.text':
      return (
        <Text style={[a.text_md, a.leading_normal]}>
          <FacetSpans
            plaintext={(block as {plaintext?: string}).plaintext ?? ''}
            facets={(block as {facets?: Facet[]}).facets}
          />
        </Text>
      )
    case 'blog.pckt.block.image': {
      const imageBlock = block as {
        attrs?: {alt?: string; blob?: Parameters<typeof blobRefCid>[0]}
      }
      const attrs = imageBlock.attrs
      const cid = blobRefCid(attrs?.blob)
      const alt = attrs?.alt
      if (!cid) return null
      const uri = `https://cdn.bsky.app/img/feed_fullsize/plain/${ctx.authorDid}/${cid}@jpeg`
      return (
        <View style={[a.gap_xs]}>
          <Image
            source={{uri}}
            style={[a.w_full, {aspectRatio: 16 / 9, borderRadius: 6}]}
            contentFit="contain"
            accessibilityLabel={alt ?? ''}
            accessibilityHint=""
            accessibilityIgnoresInvertColors
          />
          {alt ? (
            <Text
              numberOfLines={2}
              style={[a.text_xs, t.atoms.text_contrast_medium, a.italic]}>
              {alt}
            </Text>
          ) : null}
        </View>
      )
    }
    case 'blog.pckt.block.taskList': {
      const items =
        (
          block as {
            content?: Array<{
              checked?: boolean
              content?: PcktBlock[]
            }>
          }
        ).content ?? []
      return (
        <View style={[a.gap_xs]}>
          {items.map((it, i) => (
            <View key={i} style={[a.flex_row, a.gap_sm, a.align_start]}>
              <Text style={[a.text_md]}>{it.checked ? '☑' : '☐'}</Text>
              <View style={[a.flex_1]}>
                {(it.content ?? []).map((sub, j) => (
                  <PcktBlockNode key={j} block={sub} ctx={ctx} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )
    }
    case 'blog.pckt.block.orderedList': {
      const items =
        (block as {content?: Array<{content?: PcktBlock[]}>}).content ?? []
      return (
        <View style={[a.gap_xs]}>
          {items.map((it, i) => (
            <View key={i} style={[a.flex_row, a.gap_sm, a.align_start]}>
              <Text style={[a.text_md]}>{i + 1}.</Text>
              <View style={[a.flex_1]}>
                {(it.content ?? []).map((sub, j) => (
                  <PcktBlockNode key={j} block={sub} ctx={ctx} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )
    }
    case 'blog.pckt.block.blockquote': {
      const inner = (block as {content?: PcktBlock[]}).content ?? []
      return (
        <View
          style={[
            a.pl_md,
            {
              borderLeftWidth: 3,
              borderLeftColor: t.atoms.border_contrast_medium.borderColor,
            },
          ]}>
          {inner.map((sub, i) => (
            <PcktBlockNode key={i} block={sub} ctx={ctx} />
          ))}
        </View>
      )
    }
    default:
      return (
        <Text style={[a.text_md, a.leading_normal, t.atoms.text_contrast_low]}>
          {(block as {plaintext?: string}).plaintext ?? ''}
        </Text>
      )
  }
}

function FacetSpans({
  plaintext,
  facets,
}: {
  plaintext: string
  facets?: Facet[]
}) {
  const segments = splitByFacets(plaintext, facets)
  return (
    <Fragment>
      {segments.map((seg, i) => {
        if (seg.kind === 'plain') return <Fragment key={i}>{seg.text}</Fragment>
        if (seg.kind === 'link' && seg.uri) {
          const uri = seg.uri
          return (
            <Text
              key={i}
              onPress={() => Linking.openURL(uri)}
              style={[{textDecorationLine: 'underline'}]}>
              {seg.text}
            </Text>
          )
        }
        if (seg.kind === 'italic') {
          return (
            <Text key={i} style={[a.italic]}>
              {seg.text}
            </Text>
          )
        }
        if (seg.kind === 'bold') {
          return (
            <Text key={i} style={[a.font_bold]}>
              {seg.text}
            </Text>
          )
        }
        if (seg.kind === 'code') {
          return (
            <Text
              key={i}
              style={[
                {
                  fontFamily: 'monospace',
                  fontVariant: ['tabular-nums'],
                },
              ]}>
              {seg.text}
            </Text>
          )
        }
        return <Fragment key={i}>{seg.text}</Fragment>
      })}
    </Fragment>
  )
}

const md = new MarkdownIt({html: false, linkify: true, breaks: true})

type InlineSpan =
  | {kind: 'text'; text: string}
  | {kind: 'link'; text: string; uri: string}
  | {kind: 'em'; spans: InlineSpan[]}
  | {kind: 'strong'; spans: InlineSpan[]}
  | {kind: 'code'; text: string}
  | {kind: 'softbreak'}
  | {kind: 'hardbreak'}

function MarkdownBody({text}: {text: string}) {
  const t = useTheme()
  const tokens = md.parse(text, {})
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok.type === 'paragraph_open') {
      const inlineTok = tokens[i + 1]
      const spans = inlineTok?.children ? inlineToSpans(inlineTok.children) : []
      nodes.push(
        <Text key={key++} style={[a.text_md, a.leading_normal]}>
          <InlineSpansRender spans={spans} />
        </Text>,
      )
      i += 3
    } else if (tok.type === 'heading_open') {
      const level = parseInt(tok.tag.slice(1), 10) || 2
      const inlineTok = tokens[i + 1]
      const spans = inlineTok?.children ? inlineToSpans(inlineTok.children) : []
      const sizeStyle = level <= 1 ? a.text_2xl : a.text_xl
      nodes.push(
        <Text
          key={key++}
          style={[sizeStyle, a.font_bold, a.leading_tight, a.mt_sm]}>
          <InlineSpansRender spans={spans} />
        </Text>,
      )
      i += 3
    } else if (tok.type === 'fence' || tok.type === 'code_block') {
      nodes.push(
        <View
          key={key++}
          style={[
            a.rounded_sm,
            a.p_sm,
            t.atoms.bg_contrast_25,
            {
              borderLeftWidth: 3,
              borderLeftColor: t.atoms.border_contrast_medium.borderColor,
            },
          ]}>
          <Text
            style={[{fontFamily: 'monospace'}, a.text_sm, a.leading_normal]}>
            {tok.content.replace(/\n$/, '')}
          </Text>
        </View>,
      )
      i += 1
    } else if (
      tok.type === 'bullet_list_open' ||
      tok.type === 'ordered_list_open'
    ) {
      const ordered = tok.type === 'ordered_list_open'
      const items: React.ReactNode[] = []
      let j = i + 1
      let idx = 0
      while (
        j < tokens.length &&
        tokens[j].type !== 'bullet_list_close' &&
        tokens[j].type !== 'ordered_list_close'
      ) {
        if (tokens[j].type === 'list_item_open') {
          let k = j + 1
          const itemSpans: InlineSpan[] = []
          while (k < tokens.length && tokens[k].type !== 'list_item_close') {
            if (tokens[k].type === 'inline' && tokens[k].children) {
              itemSpans.push(...inlineToSpans(tokens[k].children!))
            }
            k++
          }
          items.push(
            <View key={idx} style={[a.flex_row, a.gap_sm]}>
              <Text style={[a.text_md]}>{ordered ? `${idx + 1}.` : '•'}</Text>
              <Text style={[a.flex_1, a.text_md, a.leading_normal]}>
                <InlineSpansRender spans={itemSpans} />
              </Text>
            </View>,
          )
          idx++
          j = k + 1
        } else {
          j++
        }
      }
      nodes.push(
        <View key={key++} style={[a.gap_xs]}>
          {items}
        </View>,
      )
      i = j + 1
    } else if (tok.type === 'blockquote_open') {
      let j = i + 1
      const inner: InlineSpan[] = []
      while (j < tokens.length && tokens[j].type !== 'blockquote_close') {
        if (tokens[j].type === 'inline' && tokens[j].children) {
          inner.push(...inlineToSpans(tokens[j].children!))
        }
        j++
      }
      nodes.push(
        <View
          key={key++}
          style={[
            a.pl_md,
            {
              borderLeftWidth: 3,
              borderLeftColor: t.atoms.border_contrast_medium.borderColor,
            },
          ]}>
          <Text
            style={[
              a.text_md,
              a.leading_normal,
              a.italic,
              t.atoms.text_contrast_high,
            ]}>
            <InlineSpansRender spans={inner} />
          </Text>
        </View>,
      )
      i = j + 1
    } else {
      i++
    }
  }
  return <View style={[a.gap_sm]}>{nodes}</View>
}

function inlineToSpans(children: unknown[]): InlineSpan[] {
  const out: InlineSpan[] = []
  const stack: Array<'em' | 'strong'> = []
  const buf: InlineSpan[][] = [out]
  for (const raw of children) {
    const tok = raw as {
      type: string
      content?: string
      attrs?: Array<[string, string]>
    }
    const cur = buf[buf.length - 1]
    switch (tok.type) {
      case 'text':
        cur.push({kind: 'text', text: tok.content ?? ''})
        break
      case 'softbreak':
        cur.push({kind: 'softbreak'})
        break
      case 'hardbreak':
        cur.push({kind: 'hardbreak'})
        break
      case 'code_inline':
        cur.push({kind: 'code', text: tok.content ?? ''})
        break
      case 'link_open': {
        const href = (tok.attrs ?? []).find(([k]) => k === 'href')?.[1] ?? ''
        const inner: InlineSpan[] = []
        cur.push({
          kind: 'link',
          text: '',
          uri: href,
          ...{spans: inner},
        })
        buf.push(inner)
        break
      }
      case 'link_close':
        buf.pop()
        break
      case 'em_open':
        stack.push('em')
        {
          const inner: InlineSpan[] = []
          cur.push({kind: 'em', spans: inner})
          buf.push(inner)
        }
        break
      case 'em_close':
      case 'strong_close':
        stack.pop()
        buf.pop()
        break
      case 'strong_open':
        stack.push('strong')
        {
          const inner: InlineSpan[] = []
          cur.push({kind: 'strong', spans: inner})
          buf.push(inner)
        }
        break
      default:
        break
    }
  }
  return out
}

function InlineSpansRender({spans}: {spans: InlineSpan[]}) {
  return (
    <Fragment>
      {spans.map((s, i) => {
        if (s.kind === 'text') return <Fragment key={i}>{s.text}</Fragment>
        if (s.kind === 'softbreak' || s.kind === 'hardbreak') {
          return <Text key={i}>{'\n'}</Text>
        }
        if (s.kind === 'code') {
          return (
            <Text key={i} style={[{fontFamily: 'monospace'}]}>
              {s.text}
            </Text>
          )
        }
        if (s.kind === 'em') {
          return (
            <Text key={i} style={[a.italic]}>
              <InlineSpansRender spans={s.spans} />
            </Text>
          )
        }
        if (s.kind === 'strong') {
          return (
            <Text key={i} style={[a.font_bold]}>
              <InlineSpansRender spans={s.spans} />
            </Text>
          )
        }
        if (s.kind === 'link') {
          const linkSpans = (s as {spans?: InlineSpan[]}).spans ?? []
          const uri = s.uri
          return (
            <Text
              key={i}
              onPress={() => Linking.openURL(uri)}
              style={[{textDecorationLine: 'underline'}]}>
              <InlineSpansRender spans={linkSpans} />
            </Text>
          )
        }
        return null
      })}
    </Fragment>
  )
}
