import {type OAuthSession, TokenRefreshError} from '@atproto/oauth-client'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {oauthResumeSessionWithRetry} from '../oauth-agent'
import {emitOauthTelemetry} from '../oauth-telemetry'
import {type SessionAccount} from '../types'

const mockRestore =
  jest.fn<(did: string, refresh?: boolean) => Promise<OAuthSession>>()

jest.mock('@atproto/oauth-client-expo', () => {
  return {
    ...jest.requireActual<object>('@atproto/oauth-client'),
    ExpoOAuthClient: class {
      restore(did: string, refresh?: boolean) {
        return mockRestore(did, refresh)
      }
    },
  }
})

jest.mock('@atproto/lexicon', () => ({
  ...jest.requireActual<object>('@atproto/lexicon'),
  jsonStringToLex: (str: string): unknown => JSON.parse(str),
}))

jest.mock('../moderation', () => ({
  configureModerationForAccount: () => Promise.resolve(),
}))

jest.mock('../oauth-telemetry', () => ({
  ...jest.requireActual<object>('../oauth-telemetry'),
  emitOauthTelemetry: jest.fn(),
}))

const DID = 'did:plc:alice'

const storedAccount: SessionAccount = {
  service: 'https://pds.test',
  did: DID,
  handle: 'alice.stored',
  email: 'alice@example.com',
  emailConfirmed: true,
  emailAuthFactor: false,
  active: true,
  pdsUrl: 'https://pds.test',
  isSelfHosted: true,
  isOauthSession: true,
}

function jsonResponse(status: number, body: object, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', ...headers},
  })
}

const okSession = () =>
  jsonResponse(200, {
    did: DID,
    handle: 'alice.fresh',
    email: 'alice@example.com',
    emailConfirmed: true,
    active: true,
  })

function fakeSession(fetchHandler: () => Promise<Response>) {
  return {
    did: DID,
    serverMetadata: {issuer: 'https://pds.test'},
    server: {issuer: 'https://pds.test'},
    fetchHandler,
    getTokenInfo: () => Promise.resolve({aud: 'https://pds.test'}),
  } as unknown as OAuthSession
}

const degradedEvents = () =>
  jest
    .mocked(emitOauthTelemetry)
    .mock.calls.map(([event]) => event)
    .filter(event => event.type === 'oauth:sessionResumeDegraded')

describe('oauthResumeSessionWithRetry', () => {
  beforeEach(() => {
    mockRestore.mockReset()
    jest.mocked(emitOauthTelemetry).mockClear()
  })

  it('proceeds normally when the retry succeeds', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(502, {error: 'UpstreamFailure'}))
      .mockResolvedValueOnce(okSession())
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    const {account} = await oauthResumeSessionWithRetry(storedAccount)

    expect(account.handle).toBe('alice.fresh')
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(mockRestore.mock.calls.every(([, r]) => r === undefined)).toBe(true)
    expect(degradedEvents()).toEqual([])
  })

  it('keeps the stored account when getSession keeps failing with a 5xx', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(500, {error: 'InternalServerError'})),
      )
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    const {account, agent} = await oauthResumeSessionWithRetry(storedAccount)

    expect(account).toEqual(storedAccount)
    expect(agent.session?.did).toBe(DID)
    expect(mockRestore).toHaveBeenLastCalledWith(DID, false)
    expect(degradedEvents()).toEqual([
      {
        type: 'oauth:sessionResumeDegraded',
        payload: expect.objectContaining({errorCategory: 'serverError'}),
      },
    ])
  })

  it('keeps the stored account on a DPoP proof rejection', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            401,
            {error: 'invalid_dpop_proof', message: 'DPoP proof replayed'},
            {'www-authenticate': 'DPoP error="invalid_dpop_proof"'},
          ),
        ),
      )
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    const {account} = await oauthResumeSessionWithRetry(storedAccount)

    expect(account).toEqual(storedAccount)
    expect(degradedEvents()[0]?.payload).toEqual(
      expect.objectContaining({errorCategory: 'dpopOther'}),
    )
  })

  it('keeps the stored account when the token refresh request fails', async () => {
    mockRestore.mockImplementation((_did, refresh) =>
      refresh === false
        ? Promise.resolve(fakeSession(() => Promise.resolve(okSession())))
        : Promise.reject(new TypeError('Network request failed')),
    )

    const {account} = await oauthResumeSessionWithRetry(storedAccount)

    expect(account).toEqual(storedAccount)
    expect(mockRestore).toHaveBeenCalledTimes(3)
    expect(degradedEvents()[0]?.payload).toEqual(
      expect.objectContaining({errorCategory: 'network'}),
    )
  })

  it('signs out without retrying when the refresh token is rejected', async () => {
    mockRestore.mockRejectedValue(
      new TokenRefreshError(DID, 'Refresh token replayed'),
    )

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow(
      'Refresh token replayed',
    )
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('does not keep the stored account on a non-transient error', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: 'AccountTakedown',
            message: 'Account has been taken down',
          }),
        ),
      )
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow(
      'Account has been taken down',
    )
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out when deleting a rejected session also failed', async () => {
    mockRestore.mockRejectedValue(
      new AggregateError([
        new TokenRefreshError(DID, 'Refresh token replayed'),
        new Error('store write failed'),
      ]),
    )

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow()
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out when a terminal error surfaces through getSession', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockRejectedValue(
        new TokenRefreshError(DID, 'The session was deleted by another process'),
      )
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow(
      'The session was deleted by another process',
    )
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out when the session was deleted while retrying', async () => {
    mockRestore.mockImplementation((_did, refresh) =>
      refresh === false
        ? Promise.reject(
            new TokenRefreshError(
              DID,
              'The session was deleted by another process',
            ),
          )
        : Promise.resolve(
            fakeSession(() =>
              Promise.resolve(jsonResponse(503, {error: 'NotEnoughResources'})),
            ),
          ),
    )

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow(
      'The session was deleted by another process',
    )
    expect(degradedEvents()).toEqual([])
  })
})
