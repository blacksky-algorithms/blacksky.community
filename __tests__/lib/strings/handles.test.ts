import {
  buildHandleCandidates,
  getLoginTypeaheadQuery,
  isCorrectedLoginIdentifier,
  type IsValidHandle,
  normalizeLoginIdentifier,
  sortByUserDomains,
  validateServiceHandle,
} from '#/lib/strings/handles'

describe('handle validation', () => {
  const valid = [
    ['ali', 'bsky.social'],
    ['alice', 'bsky.social'],
    ['a-lice', 'bsky.social'],
    ['a-----lice', 'bsky.social'],
    ['123', 'bsky.social'],
    ['123456789012345678', 'bsky.social'],
    ['alice', 'custom-pds.com'],
    ['alice', 'my-custom-pds-with-long-name.social'],
    ['123456789012345678', 'my-custom-pds-with-long-name.social'],
  ]
  it.each(valid)(`should be valid: %s.%s`, (handle, service) => {
    const result = validateServiceHandle(handle, service)
    expect(result.overall).toEqual(true)
  })

  const invalid = [
    ['al', 'bsky.social', 'frontLengthNotTooShort'],
    ['-alice', 'bsky.social', 'hyphenStartOrEnd'],
    ['alice-', 'bsky.social', 'hyphenStartOrEnd'],
    ['%%%', 'bsky.social', 'handleChars'],
    ['1234567890123456789', 'bsky.social', 'frontLengthNotTooLong'],
    [
      '1234567890123456789',
      'my-custom-pds-with-long-name.social',
      'frontLengthNotTooLong',
    ],
    ['al', 'my-custom-pds-with-long-name.social', 'frontLengthNotTooShort'],
    ['a'.repeat(300), 'toolong.com', 'totalLength'],
  ] satisfies [string, string, keyof IsValidHandle][]
  it.each(invalid)(
    `should be invalid: %s.%s due to %s`,
    (handle, service, expectedError) => {
      const result = validateServiceHandle(handle, service)
      expect(result.overall).toEqual(false)
      expect(result[expectedError]).toEqual(false)
    },
  )
})

describe('normalizeLoginIdentifier', () => {
  const cases: [string, string][] = [
    ['maria.bsky.social', 'maria.bsky.social'],
    ['maria.blacksky.app', 'maria.blacksky.app'],
    ['  Maria.Bsky.Social  ', 'maria.bsky.social'],
    ['@maria.bsky.social', 'maria.bsky.social'],
    ['maria@bsky.app', 'maria.bsky.app'],
    ['@maria@bsky.social', 'maria.bsky.social'],
    ['bigdocenergy23', 'bigdocenergy23'],
    ['@BigDocEnergy23', 'bigdocenergy23'],
    ['maria.bsky.social.', 'maria.bsky.social'],
  ]
  it.each(cases)(`normalizes %s to %s`, (input, expected) => {
    expect(normalizeLoginIdentifier(input)).toEqual(expected)
  })

  it('leaves DIDs untouched apart from trimming', () => {
    expect(normalizeLoginIdentifier(' did:plc:abc123 ')).toEqual(
      'did:plc:abc123',
    )
    expect(normalizeLoginIdentifier('did:web:Example.com')).toEqual(
      'did:web:Example.com',
    )
    expect(normalizeLoginIdentifier('DID:web:Example.com')).toEqual(
      'DID:web:Example.com',
    )
  })

  it('returns empty string for empty input', () => {
    expect(normalizeLoginIdentifier('   ')).toEqual('')
  })
})

describe('isCorrectedLoginIdentifier', () => {
  const notCorrections: string[] = [
    'maria.bsky.social',
    '  Maria.Bsky.Social  ',
    '@maria.bsky.social',
    'bigdocenergy23',
    ' did:plc:abc123 ',
  ]
  it.each(notCorrections)(`%s is not a correction`, input => {
    expect(
      isCorrectedLoginIdentifier(input, normalizeLoginIdentifier(input)),
    ).toEqual(false)
  })

  const corrections: string[] = ['maria@bsky.app', 'maria.bsky.social.']
  it.each(corrections)(`%s is a correction`, input => {
    expect(
      isCorrectedLoginIdentifier(input, normalizeLoginIdentifier(input)),
    ).toEqual(true)
  })
})

describe('buildHandleCandidates', () => {
  it('builds one candidate per service domain plus bsky.social', () => {
    expect(
      buildHandleCandidates('maria', ['.myatproto.social', '.blacksky.app']),
    ).toEqual([
      'maria.myatproto.social',
      'maria.blacksky.app',
      'maria.bsky.social',
    ])
  })

  it('handles domains without a leading dot and dedupes', () => {
    expect(buildHandleCandidates('maria', ['bsky.social'])).toEqual([
      'maria.bsky.social',
    ])
  })

  it('falls back to bsky.social when no domains are known', () => {
    expect(buildHandleCandidates('maria', undefined)).toEqual([
      'maria.bsky.social',
    ])
    expect(buildHandleCandidates('maria', [])).toEqual(['maria.bsky.social'])
  })
})

describe('getLoginTypeaheadQuery', () => {
  it('returns the normalized identifier for partial handles', () => {
    expect(getLoginTypeaheadQuery('  @Maria ')).toBe('maria')
    expect(getLoginTypeaheadQuery('maria.blacksky.')).toBe('maria.blacksky')
  })

  it('needs at least two characters', () => {
    expect(getLoginTypeaheadQuery('')).toBe('')
    expect(getLoginTypeaheadQuery('@m')).toBe('')
    expect(getLoginTypeaheadQuery('ma')).toBe('ma')
  })

  it('skips email-shaped and DID input', () => {
    expect(getLoginTypeaheadQuery('maria@example.com')).toBe('')
    expect(getLoginTypeaheadQuery('maria@')).toBe('')
    expect(getLoginTypeaheadQuery('did:plc:abc123')).toBe('')
    expect(getLoginTypeaheadQuery('DID:plc:abc123')).toBe('')
  })
})

describe('sortByUserDomains', () => {
  const profiles = [
    {handle: 'maria.bsky.social'},
    {handle: 'maria.example.com'},
    {handle: 'maria.blacksky.app'},
    {handle: 'mariab.blacksky.app'},
  ]

  it('puts handles on the service domains first, keeping order otherwise', () => {
    expect(
      sortByUserDomains(profiles, ['.blacksky.app']).map(p => p.handle),
    ).toEqual([
      'maria.blacksky.app',
      'mariab.blacksky.app',
      'maria.bsky.social',
      'maria.example.com',
    ])
  })

  it('does not match a domain that only shares a suffix', () => {
    expect(
      sortByUserDomains(
        [{handle: 'maria.notblacksky.app'}, {handle: 'maria.blacksky.app'}],
        ['blacksky.app'],
      ).map(p => p.handle),
    ).toEqual(['maria.blacksky.app', 'maria.notblacksky.app'])
  })

  it('leaves order unchanged without service domains', () => {
    expect(sortByUserDomains(profiles)).toEqual(profiles)
  })
})
