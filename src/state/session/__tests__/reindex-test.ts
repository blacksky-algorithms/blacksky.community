import {describe, expect, it, jest} from '@jest/globals'

import {verifyAndRepairAccountIndexing} from '../account-indexing'

const NO_DELAYS = {pollDelaysMs: [0, 0, 0], confirmDelaysMs: [0]}

function makeOps({
  getProfile,
  handle = 'alice.test',
  hasSession = true,
}: {
  getProfile: () => Promise<unknown>
  handle?: string
  hasSession?: boolean
}) {
  const updateHandle = jest.fn((_handle: string) => Promise.resolve())
  const ops = {
    getProfile: jest.fn(getProfile),
    getHandle: () => (hasSession ? handle : undefined),
    updateHandle,
  }
  return {ops, updateHandle}
}

describe('verifyAndRepairAccountIndexing', () => {
  it('does not repair when the profile is already indexed', async () => {
    const {ops, updateHandle} = makeOps({
      getProfile: () => Promise.resolve({}),
    })

    await verifyAndRepairAccountIndexing(ops, NO_DELAYS)

    expect(updateHandle).not.toHaveBeenCalled()
  })

  it('re-emits the identity event via updateHandle when the profile never indexes', async () => {
    const {ops, updateHandle} = makeOps({
      getProfile: () => Promise.reject(new Error('Profile not found')),
    })

    await verifyAndRepairAccountIndexing(ops, NO_DELAYS)

    expect(updateHandle).toHaveBeenCalledTimes(1)
    expect(updateHandle).toHaveBeenCalledWith('alice.test')
  })

  it('repairs with the current session handle, not a captured one', async () => {
    const {ops, updateHandle} = makeOps({
      getProfile: () => Promise.reject(new Error('Profile not found')),
      handle: 'alice-renamed.test',
    })

    await verifyAndRepairAccountIndexing(ops, NO_DELAYS)

    expect(updateHandle).toHaveBeenCalledWith('alice-renamed.test')
  })

  it('never throws when updateHandle fails', async () => {
    const {ops, updateHandle} = makeOps({
      getProfile: () => Promise.reject(new Error('Profile not found')),
    })
    updateHandle.mockImplementation(() =>
      Promise.reject(new Error('handle taken')),
    )

    await expect(
      verifyAndRepairAccountIndexing(ops, NO_DELAYS),
    ).resolves.toBeUndefined()
  })

  it('does not repair when there is no active session handle', async () => {
    const {ops, updateHandle} = makeOps({
      getProfile: () => Promise.reject(new Error('Profile not found')),
      hasSession: false,
    })

    await verifyAndRepairAccountIndexing(ops, NO_DELAYS)

    expect(updateHandle).not.toHaveBeenCalled()
  })
})
