import {type OAuthSession} from '@atproto/oauth-client'
import {describe, expect, it, jest} from '@jest/globals'

import {restoreOAuthSession} from '../oauth-restore'

describe('OAuth restore coordination', () => {
  it('shares one in-flight restore for the same DID', async () => {
    let resolve!: (session: OAuthSession) => void
    const pending = new Promise<OAuthSession>(res => {
      resolve = res
    })
    const client = {restore: jest.fn(() => pending)}

    const first = restoreOAuthSession(client, 'did:plc:alice', 1_000)
    const second = restoreOAuthSession(client, 'did:plc:alice', 1_000)
    const session = {} as OAuthSession
    resolve(session)

    await expect(first).resolves.toBe(session)
    await expect(second).resolves.toBe(session)
    expect(client.restore).toHaveBeenCalledTimes(1)
  })

  it('keeps a timed-out restore shared until the underlying call settles', async () => {
    jest.useFakeTimers()
    let resolve!: (session: OAuthSession) => void
    const pending = new Promise<OAuthSession>(res => {
      resolve = res
    })
    const client = {restore: jest.fn(() => pending)}

    const first = restoreOAuthSession(client, 'did:plc:bob', 10)
    const timedOut = expect(first).rejects.toThrow(
      'OAuth session restore timed out',
    )
    await jest.advanceTimersByTimeAsync(10)
    await timedOut

    const second = restoreOAuthSession(client, 'did:plc:bob', 1_000)
    const session = {} as OAuthSession
    resolve(session)

    await expect(second).resolves.toBe(session)
    expect(client.restore).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })
})
