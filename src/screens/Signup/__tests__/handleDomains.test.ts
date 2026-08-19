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

  it('returns nothing when no advertised domain matches the community', () => {
    expect(filterUserDomains(['.blacksky.app'], ['.latinsky.app'])).toEqual([])
  })
})
