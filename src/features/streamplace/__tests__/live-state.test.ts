import {
  EMPTY_LIVE_STATE,
  isLiveAt,
  type LiveState,
  reduceLiveEvent,
} from '../live-state'

const msg = (uri: string, did: string, text: string, createdAt: string) => ({
  $type: 'place.stream.chat.defs#messageView',
  uri,
  cid: 'bafy',
  indexedAt: createdAt,
  author: {did, handle: `${did}.test`},
  record: {
    $type: 'place.stream.chat.message',
    text,
    createdAt,
    streamer: 'did:plc:s',
  },
})

const apply = (events: unknown[], now = 1000): LiveState =>
  events.reduce<LiveState>(
    (s, e) => reduceLiveEvent(s, e, now),
    EMPTY_LIVE_STATE,
  )

it('keeps messages oldest-first even when the burst arrives newest-first', () => {
  const s = apply([
    msg('at://a/2', 'did:a', 'second', '2026-09-25T00:00:02Z'),
    msg('at://a/1', 'did:a', 'first', '2026-09-25T00:00:01Z'),
  ])
  expect(s.messages.map(m => m.text)).toEqual(['first', 'second'])
})

it('orders by server indexedAt, not the sender-controlled createdAt', () => {
  const future = {
    ...msg('at://a/1', 'did:a', 'spoofed', '2026-09-25T00:00:01Z'),
    record: {
      $type: 'place.stream.chat.message',
      text: 'spoofed',
      createdAt: '2099-01-01T00:00:00Z',
      streamer: 'did:plc:s',
    },
  }
  const s = apply([
    future,
    msg('at://a/2', 'did:a', 'later', '2026-09-25T00:00:02Z'),
  ])
  expect(s.messages.map(m => m.text)).toEqual(['spoofed', 'later'])
})

it('dedupes by uri across reconnect bursts', () => {
  const m = msg('at://a/1', 'did:a', 'hi', '2026-09-25T00:00:01Z')
  expect(apply([m, m]).messages).toHaveLength(1)
})

it('removes deleted and gated messages', () => {
  const m = msg('at://a/1', 'did:a', 'hi', '2026-09-25T00:00:01Z')
  expect(apply([m, {...m, deleted: true}]).messages).toHaveLength(0)
  expect(
    apply([m, {$type: 'place.stream.chat.gate', hiddenMessage: 'at://a/1'}])
      .messages,
  ).toHaveLength(0)
})

it('drops a blocked author, including later messages', () => {
  const s = apply([
    msg('at://a/1', 'did:a', 'hi', '2026-09-25T00:00:01Z'),
    {$type: 'place.stream.defs#blockView', record: {subject: 'did:a'}},
    msg('at://a/2', 'did:a', 'again', '2026-09-25T00:00:02Z'),
  ])
  expect(s.messages).toHaveLength(0)
})

it('caps history at 200 messages', () => {
  const events = Array.from({length: 250}, (_, i) =>
    msg(`at://a/${i}`, 'did:a', `m${i}`, new Date(i * 1000).toISOString()),
  )
  const s = apply(events)
  expect(s.messages).toHaveLength(200)
  expect(s.messages[0].text).toBe('m50')
})

it('tracks livestream title, end, viewer count and liveness', () => {
  const s = apply(
    [
      {
        $type: 'place.stream.livestream#livestreamView',
        record: {title: 'Speedrun'},
      },
      {$type: 'place.stream.livestream#viewerCount', count: 12},
      {$type: 'place.stream.segment'},
    ],
    5000,
  )
  expect(s.title).toBe('Speedrun')
  expect(s.viewerCount).toBe(12)
  expect(isLiveAt(s, 9000)).toBe(true)
  expect(isLiveAt(s, 20000)).toBe(false)
  const ended = reduceLiveEvent(
    s,
    {
      $type: 'place.stream.livestream#livestreamView',
      record: {title: 'Speedrun', endedAt: 'x'},
    },
    5000,
  )
  expect(isLiveAt(ended, 6000)).toBe(false)
})

it('returns the same state for unknown or malformed events', () => {
  expect(
    reduceLiveEvent(EMPTY_LIVE_STATE, {$type: 'place.stream.live.teleport'}, 0),
  ).toBe(EMPTY_LIVE_STATE)
  expect(reduceLiveEvent(EMPTY_LIVE_STATE, 'garbage', 0)).toBe(EMPTY_LIVE_STATE)
})
