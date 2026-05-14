import {
  parseStandardDocumentUri,
  parseStandardPublicationUri,
} from '#/types/standard-site'

describe('parseStandardDocumentUri', () => {
  it('parses a well-formed document at-uri', () => {
    expect(
      parseStandardDocumentUri(
        'at://did:plc:lysqukqdu6hsrhet5v2brjgo/site.standard.document/3mhiqbcymx223',
      ),
    ).toEqual({repo: 'did:plc:lysqukqdu6hsrhet5v2brjgo', rkey: '3mhiqbcymx223'})
  })

  it('rejects publication-collection uris', () => {
    expect(
      parseStandardDocumentUri(
        'at://did:plc:abc/site.standard.publication/xyz',
      ),
    ).toBeUndefined()
  })

  it('rejects http(s) urls', () => {
    expect(
      parseStandardDocumentUri('https://standard.site/some/post'),
    ).toBeUndefined()
  })

  it('rejects malformed at-uris', () => {
    expect(parseStandardDocumentUri('at://')).toBeUndefined()
    expect(parseStandardDocumentUri('at://did:plc:abc')).toBeUndefined()
    expect(
      parseStandardDocumentUri('at://did:plc:abc/site.standard.document'),
    ).toBeUndefined()
  })

  it('handles undefined / empty input', () => {
    expect(parseStandardDocumentUri(undefined)).toBeUndefined()
    expect(parseStandardDocumentUri('')).toBeUndefined()
  })
})

describe('parseStandardPublicationUri', () => {
  it('parses a well-formed publication at-uri', () => {
    expect(
      parseStandardPublicationUri(
        'at://did:plc:lysqukqdu6hsrhet5v2brjgo/site.standard.publication/abc123',
      ),
    ).toEqual({repo: 'did:plc:lysqukqdu6hsrhet5v2brjgo', rkey: 'abc123'})
  })

  it('rejects document-collection uris', () => {
    expect(
      parseStandardPublicationUri(
        'at://did:plc:abc/site.standard.document/xyz',
      ),
    ).toBeUndefined()
  })
})
