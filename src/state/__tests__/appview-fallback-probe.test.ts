import {type AtpAgent} from '@atproto/api'

import {
  probeFallbackEligibility,
  resetProbeCacheForTesting,
} from '../appview-fallback-probe'

jest.mock('#/analytics/metrics', () => ({
  metrics: {track: jest.fn()},
}))

function agentWith(getProfile: jest.Mock, did = 'did:plc:test123'): AtpAgent {
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
    const agent = agentWith(getProfile)

    expect(await probeFallbackEligibility(agent)).toBe('unknown')
    expect(await probeFallbackEligibility(agent)).toBe('eligible')
  })

  it('caches a definitive result per DID', async () => {
    const getProfile = jest.fn().mockResolvedValue({data: {}})
    const agent = agentWith(getProfile)

    await probeFallbackEligibility(agent)
    await probeFallbackEligibility(agent)
    expect(getProfile).toHaveBeenCalledTimes(1)
  })

  it('unknown without a session', async () => {
    const getProfile = jest.fn()
    const agent = {
      session: undefined,
      app: {bsky: {actor: {getProfile}}},
    } as unknown as AtpAgent
    expect(await probeFallbackEligibility(agent)).toBe('unknown')
    expect(getProfile).not.toHaveBeenCalled()
  })
})
