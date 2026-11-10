
import {type Client, XrpcResponseError} from '@atproto/lex'

import {BLUESKY_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {app} from '#/lexicons'
import {
  probeFallbackEligibility,
  resetProbeCacheForTesting,
} from '../appview-fallback-probe'

jest.mock('#/analytics/metrics', () => ({
  metrics: {track: jest.fn()},
}))

function clientWith(getProfile: jest.Mock, did = 'did:plc:test123'): Client {
  return {did, call: getProfile} as unknown as Client
}

function xrpcError(status: number, error: string) {
  return new XrpcResponseError(
    app.bsky.actor.getProfile.main,
    new Response(null, {status}),
    {encoding: 'application/json', body: {error, message: error}},
  )
}

describe('probeFallbackEligibility', () => {
  beforeEach(() => {
    resetProbeCacheForTesting()
  })

  it('eligible when the fallback appview serves the profile', async () => {
    const getProfile = jest.fn().mockResolvedValue({})
    expect(await probeFallbackEligibility(clientWith(getProfile))).toBe(
      'eligible',
    )
    expect(getProfile).toHaveBeenCalledWith(
      app.bsky.actor.getProfile,
      {actor: 'did:plc:test123'},
      BLUESKY_APPVIEW_PINNED_OPTS,
    )
  })

  it.each([
    ['AccountTakedown error name', xrpcError(400, 'AccountTakedown')],
    ['AccountDeactivated error name', xrpcError(400, 'AccountDeactivated')],
    ['401 status', xrpcError(401, 'AuthenticationRequired')],
    ['403 status', xrpcError(403, 'Forbidden')],
    ['suspended message', new Error('Account has been suspended')],
    ['taken down message', new Error('this account was taken down')],
  ])('ineligible on %s', async (_name, error) => {
    const getProfile = jest.fn().mockRejectedValue(error)
    expect(await probeFallbackEligibility(clientWith(getProfile))).toBe(
      'ineligible',
    )
  })

  it('unknown on network/transient errors, and not cached', async () => {
    const getProfile = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({})
    const client = clientWith(getProfile)

    expect(await probeFallbackEligibility(client)).toBe('unknown')
    expect(await probeFallbackEligibility(client)).toBe('eligible')
  })

  it('caches a definitive result per DID', async () => {
    const getProfile = jest.fn().mockResolvedValue({})
    const client = clientWith(getProfile)

    await probeFallbackEligibility(client)
    await probeFallbackEligibility(client)
    expect(getProfile).toHaveBeenCalledTimes(1)
  })

  it('re-probes after the cache TTL expires', async () => {
    const getProfile = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(xrpcError(400, 'AccountTakedown'))
    const client = clientWith(getProfile)
    const nowSpy = jest.spyOn(Date, 'now')

    nowSpy.mockReturnValue(1_000_000)
    expect(await probeFallbackEligibility(client)).toBe('eligible')

    nowSpy.mockReturnValue(1_000_000 + 61 * 60e3)
    expect(await probeFallbackEligibility(client)).toBe('ineligible')
    expect(getProfile).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it('unknown without a session', async () => {
    const getProfile = jest.fn()
    const client = {did: undefined, call: getProfile} as unknown as Client
    expect(await probeFallbackEligibility(client)).toBe('unknown')
    expect(getProfile).not.toHaveBeenCalled()
  })
})
