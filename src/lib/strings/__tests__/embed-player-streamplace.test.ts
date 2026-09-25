import {parseEmbedPlayerFromUrl} from '../embed-player'

it('recognises stream.place channel links', () => {
  expect(
    parseEmbedPlayerFromUrl('https://stream.place/alice.bsky.social'),
  ).toEqual({
    type: 'streamplace_stream',
    source: 'streamplace',
    playerUri: 'https://stream.place/embed/alice.bsky.social',
  })
})

it('ignores stream.place site pages', () => {
  expect(parseEmbedPlayerFromUrl('https://stream.place/about')).toBeUndefined()
})
