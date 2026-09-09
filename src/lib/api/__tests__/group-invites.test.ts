import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  acceptGroupInvite,
  GroupInviteError,
  previewGroupInvite,
} from '../group-invites'
import {getServiceAuthToken} from '../service-auth'

jest.mock('../service-auth', () => ({
  getServiceAuthToken: jest.fn(),
}))

const mockGetServiceAuthToken = jest.mocked(getServiceAuthToken)
const fetchMock = jest.fn<typeof fetch>()
const CODE = 'a'.repeat(43)
const COMMUNITY_DID = 'did:plc:community'

function response(body: unknown, ok = true, status = 200) {
  return {ok, status, json: () => Promise.resolve(body)} as Response
}

describe('group invite client API', () => {
  beforeEach(() => {
    global.fetch = fetchMock
    fetchMock.mockReset()
    mockGetServiceAuthToken.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('previews through the public Acorn tRPC query', async () => {
    fetchMock.mockResolvedValue(
      response({
        result: {
          data: {
            json: {
              community: {did: COMMUNITY_DID, name: 'Test Community'},
              group: {name: 'members', displayName: 'Members'},
              expiresAt: new Date().toISOString(),
            },
          },
        },
      }),
    )

    await expect(previewGroupInvite(CODE)).resolves.toEqual({
      community: {did: COMMUNITY_DID, name: 'Test Community'},
      group: {name: 'members', displayName: 'Members'},
      expiresAt: expect.any(String),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('?input='),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({code: CODE}),
      }),
    )
  })

  it('requests method-bound service auth for the invite community and sends it', async () => {
    mockGetServiceAuthToken.mockResolvedValue('service-token')
    fetchMock.mockResolvedValue(
      response({
        result: {
          data: {
            json: {
              communityDid: COMMUNITY_DID,
              groupName: 'members',
              membership: 'joined',
              feeds: [
                {
                  uri: 'at://feed/one',
                  name: 'One',
                  canView: true,
                  canPost: false,
                },
              ],
            },
          },
        },
      }),
    )
    const agent = {} as Parameters<typeof getServiceAuthToken>[0]['agent']

    await expect(
      acceptGroupInvite({code: CODE, communityDid: COMMUNITY_DID, agent}),
    ).resolves.toMatchObject({membership: 'joined'})
    expect(mockGetServiceAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        agent,
        aud: COMMUNITY_DID,
        lxm: 'community.blacksky.group.acceptInvite',
      }),
    )
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
        }),
      }),
    )
  })

  it('turns an expired-session service-auth response into reauthentication', async () => {
    mockGetServiceAuthToken.mockRejectedValue({status: 401})

    await expect(
      acceptGroupInvite({
        code: CODE,
        communityDid: COMMUNITY_DID,
        agent: {} as Parameters<typeof getServiceAuthToken>[0]['agent'],
      }),
    ).rejects.toMatchObject({code: GroupInviteError.AuthenticationRequired})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes stable Acorn errors without exposing raw server messages', async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: {
            json: {
              data: {code: 'INVITE_UNAVAILABLE'},
              message: 'internal row details',
            },
          },
        },
        false,
        410,
      ),
    )

    await expect(previewGroupInvite(CODE)).rejects.toMatchObject({
      code: GroupInviteError.InviteUnavailable,
    })
  })

  it('prefers Acorn stable messages over generic tRPC transport codes', async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: {
            json: {
              message: 'InviteMisconfigured',
              data: {code: 'INTERNAL_SERVER_ERROR'},
            },
          },
        },
        false,
        500,
      ),
    )

    await expect(previewGroupInvite(CODE)).rejects.toMatchObject({
      code: 'InviteMisconfigured',
    })
  })

  it('rejects a malformed successful acceptance payload as unavailable', async () => {
    mockGetServiceAuthToken.mockResolvedValue('service-token')
    fetchMock.mockResolvedValue(
      response({
        result: {
          data: {
            json: {membership: 'joined', feeds: 'not-an-array'},
          },
        },
      }),
    )

    await expect(
      acceptGroupInvite({
        code: CODE,
        communityDid: COMMUNITY_DID,
        agent: {} as Parameters<typeof getServiceAuthToken>[0]['agent'],
      }),
    ).rejects.toMatchObject({code: GroupInviteError.AuthorizationUnavailable})
  })
})
