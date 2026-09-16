export type GroupInviteFixtureScenario =
  | 'mixed'
  | 'read-only'
  | 'no-post'
  | 'zero-readable'
  | 'missing'
  | 'unavailable'
  | 'expired'
  | 'consumed'
  | 'capacity'
  | 'auth-required'
  | 'preview-outage'
  | 'accept-outage'
  | 'malformed-success'
  | 'capability-outage'
  | 'misconfigured'
  | 'rate-limit'
  | 'resumable'
  | 'existing-unpinned'
  | 'pin-update'
  | 'pin-add'
  | 'navigation'
  | 'rapid'

/**
 * These values are deliberately synthetic and only exist in the local E2E
 * fixture. They are long enough to exercise the production router's code
 * validation without putting invite material in UI selectors or logs.
 */
const fixtureCode = (name: string) => `e2e-${name}`.padEnd(43, 'x')

export const GROUP_INVITE_FIXTURE_CODES: Record<
  GroupInviteFixtureScenario,
  string
> = {
  mixed: fixtureCode('mixed'),
  'read-only': fixtureCode('read-only'),
  'no-post': fixtureCode('no-post'),
  'zero-readable': fixtureCode('zero-readable'),
  missing: fixtureCode('missing'),
  unavailable: fixtureCode('unavailable'),
  expired: fixtureCode('expired'),
  consumed: fixtureCode('consumed'),
  capacity: fixtureCode('capacity'),
  'auth-required': fixtureCode('auth-required'),
  'preview-outage': fixtureCode('preview-outage'),
  'accept-outage': fixtureCode('accept-outage'),
  'malformed-success': fixtureCode('malformed-success'),
  'capability-outage': fixtureCode('capability-outage'),
  misconfigured: fixtureCode('misconfigured'),
  'rate-limit': fixtureCode('rate-limit'),
  resumable: fixtureCode('resumable'),
  'existing-unpinned': fixtureCode('existing-unpinned'),
  'pin-update': fixtureCode('pin-update'),
  'pin-add': fixtureCode('pin-add'),
  navigation: fixtureCode('navigation'),
  rapid: fixtureCode('rapid'),
}

export type GroupInviteFixtureFeed = {
  uri: string
  name: string
  canView: boolean
  canPost: boolean
}

type InviteRecord = {
  claimedDid?: string
  grantCompleted: boolean
  malformedResponseReturned: boolean
  capabilityOutageReturned: boolean
}

export type GroupInviteFixtureResponse = {
  status: number
  body: Record<string, unknown>
}

export type GroupInviteFixtureState = {
  scenario: GroupInviteFixtureScenario
  previewRequests: number
  acceptRequests: number
  acceptRequestsWithBearer: number
  claimCount: number
  grantCompleted: boolean
  claimantCount: number
  visibleFeedCount: number
  inaccessibleFeedCount: number
}

const ERROR_STATUS = {
  InviteUnavailable: {status: 400, code: 'BAD_REQUEST'},
  GroupAtCapacity: {status: 409, code: 'CONFLICT'},
  AuthenticationRequired: {status: 401, code: 'UNAUTHORIZED'},
  AuthorizationUnavailable: {status: 503, code: 'SERVICE_UNAVAILABLE'},
  InviteMisconfigured: {status: 500, code: 'INTERNAL_SERVER_ERROR'},
  RateLimitExceeded: {status: 429, code: 'TOO_MANY_REQUESTS'},
} as const

function success(data: unknown): GroupInviteFixtureResponse {
  return {
    status: 200,
    body: {result: {data: {json: data}}},
  }
}

function failure(
  stableCode: keyof typeof ERROR_STATUS,
): GroupInviteFixtureResponse {
  const transport = ERROR_STATUS[stableCode]
  return {
    status: transport.status,
    body: {
      error: {
        json: {
          message: stableCode,
          data: {code: transport.code},
        },
      },
    },
  }
}

function isBearerAuthorization(value: string | undefined) {
  return /^Bearer\s+\S+$/.test(value ?? '')
}

export class GroupInviteFixture {
  private readonly communityName = 'Test Community'
  private readonly groupName = 'members'
  private communityDid = 'did:plc:e2e-community'
  private feeds: GroupInviteFixtureFeed[] = []
  private record: InviteRecord = this.newRecord()
  private previewRequestCount = 0
  private acceptRequestCount = 0
  private acceptRequestsWithBearer = 0
  private claimCount = 0
  private claimants = new Set<string>()
  private scenario: GroupInviteFixtureScenario

  constructor(scenario: GroupInviteFixtureScenario = 'mixed') {
    this.scenario = scenario
  }

  configure({
    scenario,
    communityDid,
    feeds,
  }: {
    scenario: GroupInviteFixtureScenario
    communityDid: string
    feeds: GroupInviteFixtureFeed[]
  }) {
    this.scenario = scenario
    this.communityDid = communityDid
    this.feeds = feeds
    this.record = this.newRecord()
    this.previewRequestCount = 0
    this.acceptRequestCount = 0
    this.acceptRequestsWithBearer = 0
    this.claimCount = 0
    this.claimants = new Set<string>()

    if (scenario === 'consumed') {
      this.record.claimedDid = 'did:plc:e2e-consumed-by-other'
      this.record.grantCompleted = true
      this.claimants.add(this.record.claimedDid)
    }
  }

  get inviteCode() {
    return GROUP_INVITE_FIXTURE_CODES[this.scenario]
  }

  get visibleFeedUris() {
    return this.responseFeeds().map(feed => feed.uri)
  }

  get allFeedUris() {
    return this.feeds.map(feed => feed.uri)
  }

  preview(code: string): GroupInviteFixtureResponse {
    this.previewRequestCount += 1

    if (code !== this.inviteCode) return failure('InviteUnavailable')
    if (
      this.scenario === 'unavailable' ||
      this.scenario === 'expired' ||
      this.scenario === 'consumed' ||
      this.scenario === 'missing'
    ) {
      return failure('InviteUnavailable')
    }
    if (this.scenario === 'preview-outage') {
      return failure('AuthorizationUnavailable')
    }
    if (this.scenario === 'misconfigured') {
      return failure('InviteMisconfigured')
    }

    return success({
      community: {did: this.communityDid, name: this.communityName},
      group: {name: this.groupName, displayName: 'Members'},
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
  }

  accept({
    code,
    authorization,
    memberDid,
  }: {
    code: string
    authorization?: string
    memberDid?: string
  }): GroupInviteFixtureResponse {
    this.acceptRequestCount += 1
    if (isBearerAuthorization(authorization)) {
      this.acceptRequestsWithBearer += 1
    }

    if (code !== this.inviteCode) return failure('InviteUnavailable')
    if (!isBearerAuthorization(authorization) || !memberDid) {
      return failure('AuthenticationRequired')
    }
    if (this.scenario === 'auth-required') {
      return failure('AuthenticationRequired')
    }
    if (this.scenario === 'accept-outage') {
      return failure('AuthorizationUnavailable')
    }
    if (this.scenario === 'misconfigured') {
      return failure('InviteMisconfigured')
    }
    if (this.scenario === 'rate-limit') {
      return failure('RateLimitExceeded')
    }
    if (this.scenario === 'capacity') {
      return failure('GroupAtCapacity')
    }
    if (this.record.claimedDid && this.record.claimedDid !== memberDid) {
      return failure('InviteUnavailable')
    }

    if (!this.record.claimedDid) {
      this.record.claimedDid = memberDid
      this.claimCount += 1
      this.claimants.add(memberDid)
      this.record.grantCompleted = true
    }

    if (
      this.scenario === 'malformed-success' &&
      !this.record.malformedResponseReturned
    ) {
      this.record.malformedResponseReturned = true
      return success({membership: 'joined', feeds: 'malformed'})
    }
    if (
      this.scenario === 'capability-outage' &&
      !this.record.capabilityOutageReturned
    ) {
      this.record.capabilityOutageReturned = true
      return failure('AuthorizationUnavailable')
    }

    return success({
      communityDid: this.communityDid,
      groupName: this.groupName,
      membership: 'joined',
      feeds: this.responseFeeds(),
    })
  }

  getState(): GroupInviteFixtureState {
    return {
      scenario: this.scenario,
      previewRequests: this.previewRequestCount,
      acceptRequests: this.acceptRequestCount,
      acceptRequestsWithBearer: this.acceptRequestsWithBearer,
      claimCount: this.claimCount,
      grantCompleted: this.record.grantCompleted,
      claimantCount: this.claimants.size,
      visibleFeedCount: this.responseFeeds().length,
      inaccessibleFeedCount: this.feeds.filter(feed => !feed.canView).length,
    }
  }

  private responseFeeds() {
    if (this.scenario === 'zero-readable') return []
    if (this.scenario === 'read-only' || this.scenario === 'no-post') {
      return this.feeds.filter(feed => feed.canView && !feed.canPost)
    }
    return this.feeds.filter(feed => feed.canView)
  }

  private newRecord(): InviteRecord {
    return {
      grantCompleted: false,
      malformedResponseReturned: false,
      capabilityOutageReturned: false,
    }
  }
}

export function isGroupInviteFixtureScenario(
  value: string | string[] | undefined,
): value is GroupInviteFixtureScenario {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(GROUP_INVITE_FIXTURE_CODES, value)
  )
}
