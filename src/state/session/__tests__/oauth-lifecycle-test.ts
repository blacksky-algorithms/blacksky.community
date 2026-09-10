import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {
  emitOauthLifecycleEvent,
  setOauthLifecycleSink,
} from '../oauth-lifecycle'

afterEach(() => setOauthLifecycleSink(null))

describe('OAuth lifecycle events', () => {
  it('delivers events emitted before the sink subscribes', () => {
    emitOauthLifecycleEvent({type: 'deleted', did: 'did:plc:alice'})
    const sink = jest.fn()

    setOauthLifecycleSink(sink)

    expect(sink).toHaveBeenCalledWith({
      type: 'deleted',
      did: 'did:plc:alice',
    })
  })

  it('bounds events queued before the sink subscribes', () => {
    for (let i = 0; i < 51; i++) {
      emitOauthLifecycleEvent({type: 'deleted', did: `did:plc:${i}`})
    }
    const sink = jest.fn()

    setOauthLifecycleSink(sink)

    expect(sink).toHaveBeenCalledTimes(50)
    expect(sink).not.toHaveBeenCalledWith({
      type: 'deleted',
      did: 'did:plc:0',
    })
  })
})
