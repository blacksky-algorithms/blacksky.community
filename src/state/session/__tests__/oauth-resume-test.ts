import {type OAuthSession, TokenRefreshError} from '@atproto/oauth-client'
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {oauthResumeSessionWithRetry, withTimeout} from '../oauth-agent'
import {emitOauthTelemetry} from '../oauth-telemetry'
import {type SessionAccount} from '../types'

const mockRestore = jest.fn<(did: string) => Promise<OAuthSession>>()

jest.mock('@atproto/oauth-client-expo', () => {
  return {
    ...jest.requireActual<object>('@atproto/oauth-client'),
    ExpoOAuthClient: class {
      restore(did: string) {
        return mockRestore(did)
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

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
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

const dpopError = (error: string, message: string) => () =>
  Promise.resolve(jsonResponse(401, {error, message}))

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

  afterEach(() => {
    jest.useRealTimers()
  })

  it('proceeds normally when the retry succeeds', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(502, {error: 'UpstreamFailure'}))
      .mockResolvedValueOnce(okSession())
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    const {account} = await oauthResumeSessionWithRetry(storedAccount, true)

    expect(account.handle).toBe('alice.fresh')
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(degradedEvents()).toEqual([])
  })

  it('keeps the stored account at launch on a 5xx and restores on the next request', async () => {
    const fetchHandler = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(500, {error: 'InternalServerError'}))
      .mockResolvedValueOnce(jsonResponse(500, {error: 'InternalServerError'}))
      .mockResolvedValueOnce(okSession())
    mockRestore.mockResolvedValue(fakeSession(fetchHandler))

    const {account, agent} = await oauthResumeSessionWithRetry(
      storedAccount,
      true,
    )

    expect(account).toEqual(storedAccount)
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(degradedEvents()).toEqual([
      {
        type: 'oauth:sessionResumeDegraded',
        payload: expect.objectContaining({errorCategory: 'serverError'}),
      },
    ])

    const {data} = await agent.com.atproto.server.getSession()
    expect(data.handle).toBe('alice.fresh')
    expect(mockRestore).toHaveBeenCalledTimes(3)
  })

  it('keeps the stored account when a refresh hangs past the timeout', async () => {
    jest.useFakeTimers()
    mockRestore.mockReturnValue(new Promise<OAuthSession>(() => {}))

    const resumed = oauthResumeSessionWithRetry(storedAccount, true)
    await jest.advanceTimersByTimeAsync(10_000)
    const {account} = await resumed

    expect(account).toEqual(storedAccount)
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()[0]?.payload).toEqual(
      expect.objectContaining({errorCategory: 'timeout'}),
    )
  })

  it.each([
    ['invalid_dpop_proof', 'DPoP proof "jti" replayed', 'dpopReplayed'],
    ['invalid_dpop_proof', 'DPoP proof is too old', 'dpopStale'],
    ['use_dpop_nonce', 'Authorization server requires nonce', 'dpopNonce'],
  ])(
    'keeps the stored account on a temporary DPoP error (%s: %s)',
    async (error, message, errorCategory) => {
      mockRestore.mockResolvedValue(fakeSession(dpopError(error, message)))

      const {account} = await oauthResumeSessionWithRetry(storedAccount, true)

      expect(account).toEqual(storedAccount)
      expect(mockRestore).toHaveBeenCalledTimes(2)
      expect(degradedEvents()[0]?.payload).toEqual(
        expect.objectContaining({errorCategory}),
      )
    },
  )

  it.each([
    'DPoP "htu" mismatch',
    'DPoP proof "iat" is in the future',
    'Failed to verify DPoP proof',
  ])('fails fast on a persistent DPoP error (%s)', async message => {
    mockRestore.mockResolvedValue(
      fakeSession(dpopError('invalid_dpop_proof', message)),
    )

    await expect(
      oauthResumeSessionWithRetry(storedAccount, true),
    ).rejects.toThrow(message)
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('keeps the stored account when the token refresh request fails', async () => {
    mockRestore.mockRejectedValue(new TypeError('Network request failed'))

    const {account} = await oauthResumeSessionWithRetry(storedAccount, true)

    expect(account).toEqual(storedAccount)
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(degradedEvents()[0]?.payload).toEqual(
      expect.objectContaining({errorCategory: 'network'}),
    )
  })

  it('returns the error outside app launch instead of keeping the account', async () => {
    mockRestore.mockResolvedValue(
      fakeSession(() =>
        Promise.resolve(jsonResponse(503, {error: 'NotEnoughResources'})),
      ),
    )

    await expect(oauthResumeSessionWithRetry(storedAccount)).rejects.toThrow(
      'NotEnoughResources',
    )
    expect(mockRestore).toHaveBeenCalledTimes(2)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out without retrying when the refresh token is rejected', async () => {
    mockRestore.mockRejectedValue(
      new TokenRefreshError(DID, 'Refresh token replayed'),
    )

    await expect(
      oauthResumeSessionWithRetry(storedAccount, true),
    ).rejects.toThrow('Refresh token replayed')
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('fails fast on a non-transient error', async () => {
    mockRestore.mockResolvedValue(
      fakeSession(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: 'AccountTakedown',
            message: 'Account has been taken down',
          }),
        ),
      ),
    )

    await expect(
      oauthResumeSessionWithRetry(storedAccount, true),
    ).rejects.toThrow('Account has been taken down')
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out when deleting a rejected session also failed', async () => {
    mockRestore.mockRejectedValue(
      new AggregateError([
        new TokenRefreshError(DID, 'Refresh token replayed'),
        new Error('store write failed'),
      ]),
    )

    await expect(
      oauthResumeSessionWithRetry(storedAccount, true),
    ).rejects.toThrow()
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })

  it('signs out when a terminal error surfaces through getSession', async () => {
    mockRestore.mockResolvedValue(
      fakeSession(() =>
        Promise.reject(
          new TokenRefreshError(
            DID,
            'The session was deleted by another process',
          ),
        ),
      ),
    )

    await expect(
      oauthResumeSessionWithRetry(storedAccount, true),
    ).rejects.toThrow('The session was deleted by another process')
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(degradedEvents()).toEqual([])
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('preserves the original rejection and clears its timer', async () => {
    jest.useFakeTimers()
    const original = {status: 502, error: 'UpstreamFailure'}

    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- XRPC-like rejections must pass through unwrapped
      withTimeout(Promise.reject(original), 1_000, 'timed out'),
    ).rejects.toBe(original)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears its timer after resolving', async () => {
    jest.useFakeTimers()

    await expect(
      withTimeout(Promise.resolve(1), 1_000, 'timed out'),
    ).resolves.toBe(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})
