
import {type Client} from '@atproto/lex'
import {
  probeFallbackEligibility,
  resetProbeCacheForTesting,
} from '../appview-fallback-probe'

jest.mock('#/analytics/metrics', () => ({
  metrics: {track: jest.fn()},
}))

function agentWith(getProfile: jest.Mock, did = 'did:plc:test123'): Client {
  return {
    session: {did},
    app: {bsky: {actor: {getProfile}}},
  } as unknown as AtpAgent
}

describe('probeFallbackEligibility', () => {
  beforeEach(() => {
    resetProbeCacheForTesting()
  })

  it('eligible when the fallback appview serves the profile', async () => {
    const getProfile = jest.fn().mockResolvedValue({data: {}})
    expect(await probeFallbackEligibility(agentWith(getProfile))).toBe(
      'eligible',
    )
  })

  it.each([
    ['AccountTakedown error name', {error: 'AccountTakedown', status: 400}],
    ['AccountDeactivated error name', {error: 'AccountDeactivated'}],
    ['401 status', {status: 401}],
    ['403 status', {status: 403}],
    ['suspended message', {message: 'Account has been suspended'}],
    ['taken down message', {message: 'this account was taken down'}],
  ])('ineligible on %s', async (_name, errShape) => {
    const getProfile = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error(), errShape))
    expect(await probeFallbackEligibility(agentWith(getProfile))).toBe(
      'ineligible',
    )
  })

  it('unknown on network/transient errors, and not cached', async () => {
    const getProfile = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({data: {}})
    const client = agentWith(getProfile)

    expect(await probeFallbackEligibility(client)).toBe('unknown')
    expect(await probeFallbackEligibility(client)).toBe('eligible')
  })

  it('caches a definitive result per DID', async () => {
    const getProfile = jest.fn().mockResolvedValue({data: {}})
    const client = agentWith(getProfile)

    await probeFallbackEligibility(client)
    await probeFallbackEligibility(client)
    expect(getProfile).toHaveBeenCalledTimes(1)
  })

  it('re-probes after the cache TTL expires', async () => {
    const getProfile = jest
      .fn()
      .mockResolvedValueOnce({data: {}})
      .mockRejectedValueOnce(
        Object.assign(new Error(), {error: 'AccountTakedown', status: 400}),
      )
    const client = agentWith(getProfile)
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
    const client = {
      session: undefined,
      app: {bsky: {actor: {getProfile}}},
    } as unknown as AtpAgent
    expect(await probeFallbackEligibility(client)).toBe('unknown')
    expect(getProfile).not.toHaveBeenCalled()
  })
})
