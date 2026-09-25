import {type PendingMessage, reconcilePending} from '../pending'

const p = (over: Partial<PendingMessage>): PendingMessage => ({
  localId: '1',
  text: 'hi',
  sentAt: 0,
  status: 'sending',
  ...over,
})

it('drops pending messages once their uri shows up on the socket', () => {
  expect(
    reconcilePending(
      [p({uri: 'at://me/1'})],
      new Set(['at://me/1']),
      1000,
      10_000,
    ),
  ).toEqual([])
})

it('marks sending messages failed after the timeout', () => {
  expect(
    reconcilePending([p({uri: 'at://me/1'})], new Set(), 10_001, 10_000)[0]
      .status,
  ).toBe('failed')
})

it('leaves recent sends alone', () => {
  const list = [p({uri: 'at://me/1'})]
  expect(reconcilePending(list, new Set(), 5000, 10_000)).toBe(list)
})

it('does not time out a send whose record has not been created yet', () => {
  const list = [p({})]
  expect(reconcilePending(list, new Set(), 60_000, 10_000)).toBe(list)
})
