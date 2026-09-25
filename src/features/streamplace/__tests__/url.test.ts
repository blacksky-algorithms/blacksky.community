import {
  livePlaylistUrl,
  liveSocketUrl,
  parseStreamplaceActor,
} from '../url'

describe('parseStreamplaceActor', () => {
  it.each([
    ['https://stream.place/alice.bsky.social', 'alice.bsky.social'],
    ['https://stream.place/@Alice.Bsky.Social', 'alice.bsky.social'],
    ['https://www.stream.place/alice.bsky.social/', 'alice.bsky.social'],
    ['https://stream.place/embed/alice.bsky.social', 'alice.bsky.social'],
    ['https://stream.place/did:plc:7icioco6iksxt3nl2oxpkj2u', 'did:plc:7icioco6iksxt3nl2oxpkj2u'],
  ])('parses %s', (url, actor) => {
    expect(parseStreamplaceActor(url)).toBe(actor)
  })

  it.each([
    'https://stream.place/',
    'https://stream.place/about',
    'https://stream.place/docs',
    'https://stream.place/alice.bsky.social/video/3abc',
    'https://example.com/alice.bsky.social',
    'not a url',
  ])('rejects %s', url => {
    expect(parseStreamplaceActor(url)).toBeUndefined()
  })
})

describe('urls', () => {
  it('builds the playlist and socket urls', () => {
    expect(livePlaylistUrl('did:plc:abc')).toBe(
      'https://stream.place/xrpc/place.stream.playback.getLivePlaylist?streamer=did:plc:abc',
    )
    expect(liveSocketUrl('did:plc:abc')).toBe(
      'wss://stream.place/api/websocket/did:plc:abc',
    )
  })
})
