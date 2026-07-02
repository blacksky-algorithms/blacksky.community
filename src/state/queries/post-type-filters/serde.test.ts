import {addFilter, buildRecord, removeFilter} from './serde'
import {POST_TYPE_FILTER_NSID, type PostTypeFiltersRecord} from './types'

const NOW = '2026-05-05T12:00:00.000Z'
const EARLIER = '2026-04-01T00:00:00.000Z'
const SUBJECT_A = 'did:plc:aaa'
const SUBJECT_B = 'did:plc:bbb'
const REPOST = 'app.bsky.feed.repost'
const QUOTE = 'app.bsky.embed.record'
const QUOTE_MEDIA = 'app.bsky.embed.recordWithMedia'

function emptyRecord(): PostTypeFiltersRecord {
  return {$type: POST_TYPE_FILTER_NSID, filters: []}
}

describe('addFilter', () => {
  it('creates a new entry when subject is unseen', () => {
    const next = addFilter(undefined, SUBJECT_A, REPOST, NOW)
    expect(next).toEqual([
      {subject: SUBJECT_A, types: [REPOST], createdAt: NOW, updatedAt: NOW},
    ])
  })

  it('appends to the existing entry without re-stamping createdAt', () => {
    const start = addFilter(undefined, SUBJECT_A, REPOST, EARLIER)
    const next = addFilter(start, SUBJECT_A, QUOTE, NOW)
    expect(next).toEqual([
      {
        subject: SUBJECT_A,
        types: [REPOST, QUOTE],
        createdAt: EARLIER,
        updatedAt: NOW,
      },
    ])
  })

  it('is idempotent for an existing type', () => {
    const start = addFilter(undefined, SUBJECT_A, REPOST, EARLIER)
    const next = addFilter(start, SUBJECT_A, REPOST, NOW)
    expect(next).toBe(start)
  })

  it('dedupes if asked to add a token already present', () => {
    const start = addFilter(undefined, SUBJECT_A, REPOST, EARLIER)
    const next = addFilter(start, SUBJECT_A, REPOST, NOW)
    expect(next[0].types).toEqual([REPOST])
  })

  it('ignores unknown $type tokens', () => {
    const next = addFilter(undefined, SUBJECT_A, 'app.example.unknown', NOW)
    expect(next).toEqual([])
  })
})

describe('removeFilter', () => {
  it('drops the entry entirely when the last type is removed', () => {
    const start = [
      {subject: SUBJECT_A, types: [REPOST], createdAt: EARLIER, updatedAt: EARLIER},
    ]
    const next = removeFilter(start, SUBJECT_A, REPOST)
    expect(next).toEqual([])
  })

  it('keeps the entry when other types remain', () => {
    const start = [
      {
        subject: SUBJECT_A,
        types: [REPOST, QUOTE],
        createdAt: EARLIER,
        updatedAt: EARLIER,
      },
    ]
    const next = removeFilter(start, SUBJECT_A, REPOST)
    expect(next).toEqual([
      {subject: SUBJECT_A, types: [QUOTE], createdAt: EARLIER, updatedAt: EARLIER},
    ])
  })

  it('is a no-op when the subject is not present', () => {
    const start = [
      {subject: SUBJECT_A, types: [REPOST], createdAt: EARLIER, updatedAt: EARLIER},
    ]
    const next = removeFilter(start, SUBJECT_B, REPOST)
    expect(next).toBe(start)
  })

  it('is a no-op when the type is not on that subject', () => {
    const start = [
      {subject: SUBJECT_A, types: [REPOST], createdAt: EARLIER, updatedAt: EARLIER},
    ]
    const next = removeFilter(start, SUBJECT_A, QUOTE)
    expect(next).toBe(start)
  })

  it('returns [] when called with no prev', () => {
    expect(removeFilter(null, SUBJECT_A, REPOST)).toEqual([])
    expect(removeFilter(undefined, SUBJECT_A, REPOST)).toEqual([])
  })
})

describe('buildRecord', () => {
  it('returns a put record with $type and updatedAt', () => {
    const prev: PostTypeFiltersRecord = {
      $type: POST_TYPE_FILTER_NSID,
      filters: [
        {
          subject: SUBJECT_A,
          types: [REPOST],
          createdAt: EARLIER,
          updatedAt: EARLIER,
        },
      ],
    }
    const result = buildRecord(prev, {op: 'add', subject: SUBJECT_A, type: QUOTE}, NOW)
    expect(result.action).toBe('put')
    expect(result.record.$type).toBe(POST_TYPE_FILTER_NSID)
    expect(result.record.updatedAt).toBe(NOW)
    expect(result.record.filters).toHaveLength(1)
    expect(result.record.filters[0].types).toEqual([REPOST, QUOTE])
  })

  it('returns a delete action when the last filter is removed', () => {
    const prev: PostTypeFiltersRecord = {
      $type: POST_TYPE_FILTER_NSID,
      filters: [
        {subject: SUBJECT_A, types: [REPOST], createdAt: EARLIER, updatedAt: EARLIER},
      ],
    }
    const result = buildRecord(prev, {op: 'remove', subject: SUBJECT_A, type: REPOST}, NOW)
    expect(result.action).toBe('delete')
  })

  it('returns a noop action when prev is null and the result list is empty', () => {
    const result = buildRecord(
      null,
      {op: 'remove', subject: SUBJECT_A, type: REPOST},
      NOW,
    )
    expect(result.action).toBe('noop')
  })

  it('produces a fresh record on add with no prev', () => {
    const result = buildRecord(
      emptyRecord(),
      {op: 'add', subject: SUBJECT_A, type: REPOST},
      NOW,
    )
    expect(result.action).toBe('put')
    expect(result.record.filters).toEqual([
      {subject: SUBJECT_A, types: [REPOST], createdAt: NOW, updatedAt: NOW},
    ])
  })

  it('supports both quote token variants', () => {
    let prev: PostTypeFiltersRecord = emptyRecord()
    prev = {
      ...prev,
      filters: addFilter(prev.filters, SUBJECT_A, QUOTE, NOW),
    }
    prev = {
      ...prev,
      filters: addFilter(prev.filters, SUBJECT_A, QUOTE_MEDIA, NOW),
    }
    const result = buildRecord(prev, {op: 'remove', subject: SUBJECT_A, type: QUOTE}, NOW)
    expect(result.action).toBe('put')
    expect(result.record.filters[0].types).toEqual([QUOTE_MEDIA])
  })
})
