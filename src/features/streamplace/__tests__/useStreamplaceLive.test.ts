import {act, renderHook} from '@testing-library/react-native'

import {useStreamplaceLive} from '../useStreamplaceLive'

class FakeSocket {
  static instances: FakeSocket[] = []
  onopen?: () => void
  onmessage?: (e: {data: string}) => void
  onclose?: () => void
  closed = false
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  close() {
    this.closed = true
  }
}

beforeEach(() => {
  FakeSocket.instances = []
  jest.useFakeTimers()
  Object.assign(global, {WebSocket: FakeSocket})
})
afterEach(() => jest.useRealTimers())

it('connects by actor, applies frames, and reconnects after close', () => {
  const {result, unmount} = renderHook(() => useStreamplaceLive('did:plc:s'))
  const ws = FakeSocket.instances[0]
  expect(ws.url).toBe('wss://stream.place/api/websocket/did:plc:s')

  act(() => {
    ws.onmessage?.({
      data: JSON.stringify({$type: 'place.stream.livestream#viewerCount', count: 7}),
    })
  })
  expect(result.current.viewerCount).toBe(7)

  act(() => {
    ws.onclose?.()
    jest.advanceTimersByTime(1000)
  })
  expect(FakeSocket.instances).toHaveLength(2)

  unmount()
  expect(FakeSocket.instances[1].closed).toBe(true)
})
