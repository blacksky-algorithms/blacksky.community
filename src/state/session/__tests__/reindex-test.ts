import {type BskyAgent} from '@atproto/api'
import {describe, expect, it, jest} from '@jest/globals'

import {verifyAndRepairAccountIndexing} from '../agent'

const NO_DELAYS = {pollDelaysMs: [0, 0, 0], confirmDelaysMs: [0]}

function makeAgent({
  getProfile,
  handle = 'alice.test',
  hasSession = true,
}: {
  getProfile: () => Promise<unknown>
  handle?: string
  hasSession?: boolean
}) {
  const updateHandle = jest.fn(() => Promise.resolve())
  const agent = {
    session: hasSession ? {did: 'did:plc:alice', handle} : undefined,
    getProfile: jest.fn(getProfile),
    updateHandle,
  } as unknown as BskyAgent
  return {agent, updateHandle}
}

describe('verifyAndRepairAccountIndexing', () => {
  it('does not repair when the profile is already indexed', async () => {
    const {agent, updateHandle} = makeAgent({
      getProfile: () => Promise.resolve({data: {}}),
    })

    await verifyAndRepairAccountIndexing(agent, 'did:plc:alice', NO_DELAYS)

    expect(updateHandle).not.toHaveBeenCalled()
  })

  it('re-emits the identity event via updateHandle when the profile never indexes', async () => {
    const {agent, updateHandle} = makeAgent({
      getProfile: () => Promise.reject(new Error('Profile not found')),
    })

    await verifyAndRepairAccountIndexing(agent, 'did:plc:alice', NO_DELAYS)

    expect(updateHandle).toHaveBeenCalledTimes(1)
    expect(updateHandle).toHaveBeenCalledWith({handle: 'alice.test'})
  })

  it('repairs with the current session handle, not a captured one', async () => {
    const {agent, updateHandle} = makeAgent({
      getProfile: () => Promise.reject(new Error('Profile not found')),
      handle: 'alice-renamed.test',
    })

    await verifyAndRepairAccountIndexing(agent, 'did:plc:alice', NO_DELAYS)

    expect(updateHandle).toHaveBeenCalledWith({handle: 'alice-renamed.test'})
  })

  it('never throws when updateHandle fails', async () => {
    const {agent} = makeAgent({
      getProfile: () => Promise.reject(new Error('Profile not found')),
    })
    ;(agent.updateHandle as jest.Mock).mockImplementation(() =>
      Promise.reject(new Error('handle taken')),
    )

    await expect(
      verifyAndRepairAccountIndexing(agent, 'did:plc:alice', NO_DELAYS),
    ).resolves.toBeUndefined()
  })

  it('does not repair when there is no active session handle', async () => {
    const {agent, updateHandle} = makeAgent({
      getProfile: () => Promise.reject(new Error('Profile not found')),
      hasSession: false,
    })

    await verifyAndRepairAccountIndexing(agent, 'did:plc:alice', NO_DELAYS)

    expect(updateHandle).not.toHaveBeenCalled()
  })
})
