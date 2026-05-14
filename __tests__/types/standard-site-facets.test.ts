import {splitByFacets} from '#/types/standard-site-facets'

describe('splitByFacets', () => {
  it('returns the whole string unfaceted when no facets', () => {
    expect(splitByFacets('hello world', undefined)).toEqual([
      {kind: 'plain', text: 'hello world'},
    ])
    expect(splitByFacets('hello world', [])).toEqual([
      {kind: 'plain', text: 'hello world'},
    ])
  })

  it('renders link facets with uri', () => {
    const segs = splitByFacets('see edge for more', [
      {
        index: {byteStart: 4, byteEnd: 8},
        features: [
          {$type: 'pub.leaflet.richtext.facet#link', uri: 'https://edge.org'},
        ],
      },
    ])
    expect(segs).toEqual([
      {kind: 'plain', text: 'see '},
      {kind: 'link', text: 'edge', uri: 'https://edge.org'},
      {kind: 'plain', text: ' for more'},
    ])
  })

  it('handles italic + bold across publishers', () => {
    const segs = splitByFacets('one two three', [
      {
        index: {byteStart: 0, byteEnd: 3},
        features: [{$type: 'app.offprint.richtext.facet#italic'}],
      },
      {
        index: {byteStart: 4, byteEnd: 7},
        features: [{$type: 'blog.pckt.richtext.facet#bold'}],
      },
    ])
    expect(segs).toEqual([
      {kind: 'italic', text: 'one'},
      {kind: 'plain', text: ' '},
      {kind: 'bold', text: 'two'},
      {kind: 'plain', text: ' three'},
    ])
  })

  it('clamps overlapping or out-of-range facets without crashing', () => {
    const segs = splitByFacets('hi', [
      {
        index: {byteStart: 100, byteEnd: 200},
        features: [{$type: 'pub.leaflet.richtext.facet#link', uri: 'x'}],
      },
    ])
    expect(segs.map(s => s.text).join('')).toContain('hi')
  })

  it('treats unknown feature types as plain', () => {
    const segs = splitByFacets('a footnote here', [
      {
        index: {byteStart: 2, byteEnd: 10},
        features: [{$type: 'pub.leaflet.richtext.facet#footnote'}],
      },
    ])
    expect(segs).toEqual([
      {kind: 'plain', text: 'a '},
      {kind: 'plain', text: 'footnote'},
      {kind: 'plain', text: ' here'},
    ])
  })

  it('decodes multi-byte UTF-8 correctly', () => {
    const text = 'café 🍞 turtle'
    const linkStart = new TextEncoder().encode('café 🍞 ').length
    const linkEnd = new TextEncoder().encode('café 🍞 turtle').length
    const segs = splitByFacets(text, [
      {
        index: {byteStart: linkStart, byteEnd: linkEnd},
        features: [
          {$type: 'pub.leaflet.richtext.facet#link', uri: 'https://t.co/1'},
        ],
      },
    ])
    expect(segs).toEqual([
      {kind: 'plain', text: 'café 🍞 '},
      {kind: 'link', text: 'turtle', uri: 'https://t.co/1'},
    ])
  })
})
