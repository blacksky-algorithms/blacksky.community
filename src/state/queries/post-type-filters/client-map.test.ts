import {
  KNOWN_TYPES,
  QUOTE_TYPES,
  REPOST_TYPE,
  isQuoteFilter,
  isRepostFilter,
} from './client-map'

const REPOST = 'app.bsky.feed.repost'
const QUOTE_RECORD = 'app.bsky.embed.record'
const QUOTE_MEDIA = 'app.bsky.embed.recordWithMedia'

describe('KNOWN_TYPES', () => {
  it('contains the three expected tokens', () => {
    expect(KNOWN_TYPES).toEqual(
      expect.arrayContaining([REPOST, QUOTE_RECORD, QUOTE_MEDIA]),
    )
    expect(KNOWN_TYPES).toHaveLength(3)
  })
})

describe('REPOST_TYPE', () => {
  it('is the app.bsky.feed.repost token', () => {
    expect(REPOST_TYPE).toBe(REPOST)
  })
})

describe('QUOTE_TYPES', () => {
  it('contains both embed variants', () => {
    expect(QUOTE_TYPES).toEqual([QUOTE_RECORD, QUOTE_MEDIA])
  })
})

describe('isRepostFilter', () => {
  it('returns true when repost token is present', () => {
    expect(isRepostFilter([REPOST])).toBe(true)
    expect(isRepostFilter([REPOST, QUOTE_RECORD])).toBe(true)
  })

  it('returns false when repost token is missing', () => {
    expect(isRepostFilter([])).toBe(false)
    expect(isRepostFilter([QUOTE_RECORD])).toBe(false)
    expect(isRepostFilter([QUOTE_MEDIA])).toBe(false)
    expect(isRepostFilter([QUOTE_RECORD, QUOTE_MEDIA])).toBe(false)
  })
})

describe('isQuoteFilter', () => {
  it('returns true when either quote token is present', () => {
    expect(isQuoteFilter([QUOTE_RECORD])).toBe(true)
    expect(isQuoteFilter([QUOTE_MEDIA])).toBe(true)
    expect(isQuoteFilter([REPOST, QUOTE_RECORD])).toBe(true)
    expect(isQuoteFilter([REPOST, QUOTE_MEDIA])).toBe(true)
  })

  it('returns false when neither quote token is present', () => {
    expect(isQuoteFilter([])).toBe(false)
    expect(isQuoteFilter([REPOST])).toBe(false)
  })
})
