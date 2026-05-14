import {type Facet} from '#/types/standard-site'

export type FacetSegment =
  | {kind: 'plain'; text: string}
  | {kind: 'link'; text: string; uri?: string}
  | {kind: 'italic'; text: string}
  | {kind: 'bold'; text: string}
  | {kind: 'code'; text: string}

export function splitByFacets(
  plaintext: string,
  facets: Facet[] | undefined,
): FacetSegment[] {
  if (!facets || facets.length === 0) {
    return [{kind: 'plain', text: plaintext}]
  }
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const bytes = encoder.encode(plaintext)
  const sorted = [...facets].sort(
    (a, b) => a.index.byteStart - b.index.byteStart,
  )
  const segments: FacetSegment[] = []
  let cursor = 0
  for (const f of sorted) {
    const start = clamp(f.index.byteStart, cursor, bytes.length)
    const end = clamp(f.index.byteEnd, start, bytes.length)
    if (start > cursor) {
      segments.push({
        kind: 'plain',
        text: decoder.decode(bytes.subarray(cursor, start)),
      })
    }
    const text = decoder.decode(bytes.subarray(start, end))
    segments.push(toSegment(text, f))
    cursor = end
  }
  if (cursor < bytes.length) {
    segments.push({
      kind: 'plain',
      text: decoder.decode(bytes.subarray(cursor, bytes.length)),
    })
  }
  return segments
}

function toSegment(text: string, facet: Facet): FacetSegment {
  for (const feat of facet.features) {
    const t = feat.$type
    if (t.endsWith('#link')) {
      const uri = (feat as {uri?: string}).uri
      return {kind: 'link', text, uri}
    }
    if (t.endsWith('#italic')) return {kind: 'italic', text}
    if (t.endsWith('#bold')) return {kind: 'bold', text}
    if (t.endsWith('#code')) return {kind: 'code', text}
  }
  return {kind: 'plain', text}
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
