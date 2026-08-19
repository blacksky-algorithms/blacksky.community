import {filterUserDomains} from '#/screens/Signup/handleDomains'

const BLACKSKY_DOMAINS = [
  '.myatproto.social',
  '.blacksky.app',
  '.cryptoanarchy.network',
  '.latinsky.app',
  '.afrolatinsky.app',
]

describe('filterUserDomains', () => {
  it("restricts domains to the selected community's handles", () => {
    expect(
      filterUserDomains(BLACKSKY_DOMAINS, [
        '.latinsky.app',
        '.afrolatinsky.app',
      ]),
    ).toEqual(['.latinsky.app', '.afrolatinsky.app'])
  })

  it('puts a community domain first so it becomes the default suffix', () => {
    const [first] = filterUserDomains(BLACKSKY_DOMAINS, ['.latinsky.app'])
    expect(first).toBe('.latinsky.app')
  })

  it('shows every advertised domain when the community config is missing', () => {
    expect(filterUserDomains(BLACKSKY_DOMAINS, undefined)).toEqual(
      BLACKSKY_DOMAINS,
    )
  })

  it('shows every advertised domain when the community lists none', () => {
    expect(filterUserDomains(BLACKSKY_DOMAINS, [])).toEqual(BLACKSKY_DOMAINS)
  })

  it('ignores community handles the PDS does not advertise', () => {
    expect(
      filterUserDomains(
        ['.medsky.network', '.nursesky.network'],
        ['.medsky.app', '.medsky.network'],
      ),
    ).toEqual(['.medsky.network'])
  })

  it('falls back to the advertised domains when nothing intersects', () => {
    expect(filterUserDomains(['.blacksky.app'], ['.latinsky.app'])).toEqual([
      '.blacksky.app',
    ])
  })

  it('never returns an empty list while the PDS advertises a domain', () => {
    // Reachable today: picking a community and then switching the hosting
    // provider leaves the community slug and the PDS pointing at different
    // servers, so the two lists can disagree entirely.
    const cases: [string[], string[]][] = [
      [['.bsky.social'], ['.latinsky.app', '.afrolatinsky.app']],
      [['.medsky.network'], ['.blacksky.app']],
    ]

    for (const [domains, allowed] of cases) {
      expect(filterUserDomains(domains, allowed)).toEqual(domains)
    }
  })
})
