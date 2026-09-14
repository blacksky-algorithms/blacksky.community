import {describe, expect, it} from '@jest/globals'

import {
  GROUP_INVITE_FIXTURE_CODES,
  GroupInviteFixture,
} from '../../../../dev-env/group-invite-fixture'

const COMMUNITY = 'did:plc:e2e-community'
const FEEDS = [
  {
    uri: 'at://did:plc:feed/app.bsky.feed.generator/read',
    name: 'Read only feed',
    canView: true,
    canPost: false,
  },
  {
    uri: 'at://did:plc:feed/app.bsky.feed.generator/post',
    name: 'Postable feed',
    canView: true,
    canPost: true,
  },
  {
    uri: 'at://did:plc:feed/app.bsky.feed.generator/hidden',
    name: 'Inaccessible feed',
    canView: false,
    canPost: false,
  },
]

function fixture(
  scenario: ConstructorParameters<typeof GroupInviteFixture>[0] = 'mixed',
) {
  const value = new GroupInviteFixture(scenario)
  value.configure({scenario, communityDid: COMMUNITY, feeds: FEEDS})
  return value
}

function bearerFor(did: string) {
  return `Bearer ${did}`
}

describe('group invite E2E fixture contract', () => {
  it('returns the public preview envelope without invite material', () => {
    const value = fixture()
    const result = value.preview(value.inviteCode)

    expect(result).toMatchObject({status: 200})
    expect(result.body).toMatchObject({
      result: {
        data: {
          json: {
            community: {did: COMMUNITY, name: 'Test Community'},
            group: {name: 'members', displayName: 'Members'},
          },
        },
      },
    })
    expect(JSON.stringify(result.body)).not.toContain(value.inviteCode)
  })

  it('requires Bearer auth and makes claims resumable for one DID only', () => {
    const value = fixture('resumable')
    const code = GROUP_INVITE_FIXTURE_CODES.resumable

    expect(value.accept({code}).status).toBe(401)
    expect(
      value.accept({
        code,
        authorization: bearerFor('did:plc:alice'),
        memberDid: 'did:plc:alice',
      }),
    ).toMatchObject({status: 200})
    expect(
      value.accept({
        code,
        authorization: bearerFor('did:plc:alice'),
        memberDid: 'did:plc:alice',
      }),
    ).toMatchObject({status: 200})
    expect(
      value.accept({
        code,
        authorization: bearerFor('did:plc:bob'),
        memberDid: 'did:plc:bob',
      }),
    ).toMatchObject({status: 400})

    expect(value.getState()).toMatchObject({
      acceptRequests: 4,
      acceptRequestsWithBearer: 3,
      claimCount: 1,
      claimantCount: 1,
    })
  })

  it('preserves adversarial feed order while omitting inaccessible feeds', () => {
    const value = fixture()
    const result = value.accept({
      code: value.inviteCode,
      authorization: bearerFor('did:plc:alice'),
      memberDid: 'did:plc:alice',
    })
    const feeds = (result.body.result as {data: {json: {feeds: unknown[]}}})
      .data.json.feeds as Array<{name: string}>

    expect(feeds.map(feed => feed.name)).toEqual([
      'Read only feed',
      'Postable feed',
    ])
    expect(value.getState()).toMatchObject({
      visibleFeedCount: 2,
      inaccessibleFeedCount: 1,
    })
  })

  it('retains membership when capability lookup fails and recovers on same-DID retry', () => {
    const value = fixture('capability-outage')
    const request = {
      code: value.inviteCode,
      authorization: bearerFor('did:plc:alice'),
      memberDid: 'did:plc:alice',
    }

    expect(value.accept(request).status).toBe(503)
    expect(value.accept(request).status).toBe(200)
    expect(value.getState()).toMatchObject({
      claimCount: 1,
      grantCompleted: true,
      acceptRequestsWithBearer: 2,
    })
  })
})
