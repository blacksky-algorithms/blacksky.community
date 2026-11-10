import {ownEventUriOf} from '../url'

const me = {did: 'did:plc:me', handle: 'me.test'}

function external(uri: string) {
  return {
    $type: 'app.bsky.embed.external#view' as const,
    external: {uri, title: 'Party', description: ''},
  }
}

describe('ownEventUriOf', () => {
  it('finds my event from a link to it by DID or by handle', () => {
    for (const actor of ['did:plc:me', 'me.test']) {
      expect(
        ownEventUriOf(
          external(`https://blacksky.community/event/${actor}/3kevent`),
          me,
        ),
      ).toBe('at://did:plc:me/community.lexicon.calendar.event/3kevent')
    }
  })

  it("ignores someone else's event", () => {
    expect(
      ownEventUriOf(
        external('https://blacksky.community/event/did:plc:other/3kevent'),
        me,
      ),
    ).toBeUndefined()
  })

  it('ignores links that are not events, and posts without a link card', () => {
    expect(
      ownEventUriOf(external('https://example.com/party'), me),
    ).toBeUndefined()
    expect(ownEventUriOf(undefined, me)).toBeUndefined()
  })
})
