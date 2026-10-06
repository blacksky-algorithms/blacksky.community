import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {
  emitOauthLifecycleEvent,
  setOauthLifecycleSink,
} from '../oauth-lifecycle'

afterEach(() => setOauthLifecycleSink(null))

describe('OAuth lifecycle events', () => {
  it('delivers events to the registered sink', () => {
    const sink = jest.fn()
    setOauthLifecycleSink(sink)

    emitOauthLifecycleEvent({type: 'deleted', did: 'did:plc:alice'})

    expect(sink).toHaveBeenCalledWith({type: 'deleted', did: 'did:plc:alice'})
  })

  it('drops events when no sink is registered', () => {
    expect(() =>
      emitOauthLifecycleEvent({type: 'deleted', did: 'did:plc:alice'}),
    ).not.toThrow()
  })
})
