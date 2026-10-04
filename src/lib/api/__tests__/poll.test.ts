import {countGraphemes} from 'unicode-segmenter/grapheme'

import {
  decodePollDraft,
  getStatementIssue,
  getStatementIssues,
  inspectText,
  isPollDraftPublishable,
  isPollTopicPublishable,
  normalizePollText,
  POLL_MAX_STATEMENTS,
  POLL_STATEMENT_MAX_BYTES,
  POLL_STATEMENT_MAX_CHARS,
  POLL_STATEMENT_MAX_GRAPHEMES,
  POLL_TOPIC_MAX_BYTES,
  POLL_TOPIC_MAX_GRAPHEMES,
  pollStatementsForPublish,
  pollTopicFromText,
} from '#/lib/api/poll'

const ASTRAL = '\u{10348}'
const COMBINING_ACUTE = '́'

describe('inspectText', () => {
  it('counts UTF-8 bytes for every code point width', () => {
    expect(inspectText('a').bytes).toBe(1)
    expect(inspectText('é').bytes).toBe(2)
    expect(inspectText('€').bytes).toBe(3)
    expect(inspectText(ASTRAL).bytes).toBe(4)
    expect(inspectText(`aé€${ASTRAL}`).bytes).toBe(10)
  })

  it('reports lone surrogates as not well formed', () => {
    expect(inspectText(ASTRAL).wellFormed).toBe(true)
    expect(inspectText('\ud800').wellFormed).toBe(false)
    expect(inspectText('\udc00').wellFormed).toBe(false)
    expect(inspectText('a\ud800b').wellFormed).toBe(false)
  })

  it('reports NUL characters', () => {
    expect(inspectText('a\u0000b').hasNul).toBe(true)
    expect(inspectText('ab').hasNul).toBe(false)
  })
})

describe('normalizePollText', () => {
  it('trims and composes to NFC', () => {
    expect(normalizePollText(`  cafe${COMBINING_ACUTE}  `)).toBe('café')
  })
})

describe('getStatementIssue', () => {
  it('accepts ordinary text', () => {
    expect(getStatementIssue('Reposts should show who boosted them')).toBeNull()
  })

  it('treats blank text as empty', () => {
    expect(getStatementIssue('')).toBe('empty')
    expect(getStatementIssue('   \n ')).toBe('empty')
  })

  it('enforces the grapheme limit', () => {
    expect(
      getStatementIssue('a'.repeat(POLL_STATEMENT_MAX_GRAPHEMES)),
    ).toBeNull()
    expect(
      getStatementIssue('a'.repeat(POLL_STATEMENT_MAX_GRAPHEMES + 1)),
    ).toBe('too_long')
  })

  it('enforces the byte limit on its own', () => {
    const cluster = '\u20ac\u20dd'
    const fits = cluster.repeat(333)
    expect(inspectText(fits).bytes).toBe(1998)
    expect(getStatementIssue(fits)).toBeNull()
    const over = cluster.repeat(334)
    expect(inspectText(over).bytes).toBe(POLL_STATEMENT_MAX_BYTES + 4)
    expect(over.length).toBe(668)
    expect(countGraphemes(over)).toBe(334)
    expect(getStatementIssue(over)).toBe('too_long')
  })

  it('enforces the character limit of the statement column on its own', () => {
    const cluster = 'x\u0336\u0336'
    const fits = cluster.repeat(332)
    expect(fits.normalize('NFC').length).toBe(996)
    expect(getStatementIssue(fits)).toBeNull()
    const over = cluster.repeat(333)
    expect(over.normalize('NFC').length).toBe(POLL_STATEMENT_MAX_CHARS + 2)
    expect(inspectText(over).bytes).toBe(1665)
    expect(countGraphemes(over)).toBe(333)
    expect(getStatementIssue(over)).toBe('too_long')
  })

  it('rejects text that cannot be stored', () => {
    expect(getStatementIssue('a\u0000b')).toBe('invalid')
    expect(getStatementIssue('a\ud800b')).toBe('invalid')
  })
})

describe('getStatementIssues', () => {
  it('marks the later of two equal statements as a duplicate', () => {
    expect(getStatementIssues(['One', 'Two', 'One'])).toEqual([
      null,
      null,
      'duplicate',
    ])
  })

  it('compares after trimming, composing and lower-casing', () => {
    expect(getStatementIssues(['Café', `  cafe${COMBINING_ACUTE} `])).toEqual([
      null,
      'duplicate',
    ])
  })

  it('reports the statement problem before the duplicate', () => {
    expect(getStatementIssues(['', ''])).toEqual(['empty', 'empty'])
  })
})

describe('isPollDraftPublishable', () => {
  it('needs between one and ten valid, distinct statements', () => {
    expect(isPollDraftPublishable({statements: ['One']})).toBe(true)
    expect(isPollDraftPublishable({statements: []})).toBe(false)
    expect(isPollDraftPublishable({statements: ['One', '']})).toBe(false)
    expect(isPollDraftPublishable({statements: ['One', 'one']})).toBe(false)
    const ten = Array.from(Array(POLL_MAX_STATEMENTS).keys(), i => `S${i}`)
    expect(isPollDraftPublishable({statements: ten})).toBe(true)
    expect(isPollDraftPublishable({statements: [...ten, 'S10']})).toBe(false)
  })
})

describe('pollStatementsForPublish', () => {
  it('returns normalized statements in order', () => {
    expect(
      pollStatementsForPublish({statements: ['  First ', 'Second']}),
    ).toEqual(['First', 'Second'])
  })
})

describe('pollTopicFromText', () => {
  it('uses short post text as it is, with whitespace collapsed', () => {
    expect(pollTopicFromText('  What should we\n\nbuild   next?  ')).toBe(
      'What should we build next?',
    )
  })

  it('keeps text of exactly the limit', () => {
    const text = 'a'.repeat(POLL_TOPIC_MAX_GRAPHEMES)
    expect(pollTopicFromText(text)).toBe(text)
  })

  it('shortens longer text to the grapheme limit with a mark', () => {
    const topic = pollTopicFromText('a'.repeat(POLL_TOPIC_MAX_GRAPHEMES + 1))
    expect(topic).toBe('a'.repeat(POLL_TOPIC_MAX_GRAPHEMES - 1) + '…')
    expect(countGraphemes(topic)).toBe(POLL_TOPIC_MAX_GRAPHEMES)
  })

  it('shortens to the byte limit when that is reached first', () => {
    const cluster = ASTRAL + '̀'
    const text = cluster.repeat(POLL_TOPIC_MAX_GRAPHEMES)
    expect(inspectText(text).bytes).toBe(1200)
    const topic = pollTopicFromText(text)
    expect(inspectText(topic).bytes).toBeLessThanOrEqual(POLL_TOPIC_MAX_BYTES)
    expect(topic).toBe(cluster.repeat(166) + '…')
    expect(inspectText(topic).bytes).toBe(999)
  })

  it('does not end on a space before the mark', () => {
    const text = 'a'.repeat(198) + ' ' + 'b'.repeat(10)
    expect(pollTopicFromText(text)).toBe('a'.repeat(198) + '…')
  })
})

describe('isPollTopicPublishable', () => {
  it('needs text that can be stored', () => {
    expect(isPollTopicPublishable('A question')).toBe(true)
    expect(isPollTopicPublishable('')).toBe(false)
    expect(isPollTopicPublishable('  \n ')).toBe(false)
    expect(isPollTopicPublishable('a\u0000b')).toBe(false)
    expect(isPollTopicPublishable('a\ud800b')).toBe(false)
  })
})

describe('decodePollDraft', () => {
  const assembly = {
    rkey: '3kaaaaaaaaaa2',
    createdAt: '2026-09-27T12:00:00.000Z',
    fingerprint: 'abc',
  }

  it('keeps unfinished statements as typed', () => {
    expect(decodePollDraft({statements: ['', ' a ']})).toEqual({
      statements: ['', ' a '],
      assembly: undefined,
    })
  })

  it('restores an assembly reference', () => {
    expect(
      decodePollDraft({
        statements: ['a'],
        assembly: {...assembly, conversationId: '7abcdefghi', reportId: 'r1'},
      }),
    ).toEqual({
      statements: ['a'],
      assembly: {...assembly, conversationId: '7abcdefghi', reportId: 'r1'},
    })
  })

  it('drops a malformed assembly reference but keeps the statements', () => {
    expect(decodePollDraft({statements: ['a'], assembly: {rkey: 1}})).toEqual({
      statements: ['a'],
      assembly: undefined,
    })
    expect(
      decodePollDraft({
        statements: ['a'],
        assembly: {...assembly, conversationId: 7},
      }),
    ).toEqual({
      statements: ['a'],
      assembly: {...assembly, conversationId: undefined, reportId: undefined},
    })
  })

  it('rejects anything that is not a list of one to ten strings', () => {
    expect(decodePollDraft(undefined)).toBeUndefined()
    expect(decodePollDraft({statements: []})).toBeUndefined()
    expect(decodePollDraft({statements: ['a', 1]})).toBeUndefined()
    expect(decodePollDraft({statements: 'a'})).toBeUndefined()
    expect(
      decodePollDraft({
        statements: Array.from(Array(POLL_MAX_STATEMENTS + 1).keys(), String),
      }),
    ).toBeUndefined()
  })
})
