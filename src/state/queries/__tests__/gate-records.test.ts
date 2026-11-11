import {type Client} from '@atproto/lex'

import {getPostgateRecord} from '../postgate'
import {getThreadgateRecord} from '../threadgate'

jest.mock('#/state/session', () => ({
  useAppviewClient: jest.fn(),
  usePdsClient: jest.fn(),
  useSession: jest.fn(),
}))

const POST = 'at://did:plc:me/app.bsky.feed.post/3kpost'
// No timezone: valid to the pre-lex validators, rejected by a strict match.
const LEGACY_DATETIME = '2023-08-01T12:00:00'

function clientReturning(value: unknown) {
  return {
    call: jest.fn().mockResolvedValue({uri: POST, value}),
  } as unknown as Client
}

describe('gate record readers', () => {
  it('returns a threadgate whose datetime predates strict formatting', async () => {
    const record = {
      $type: 'app.bsky.feed.threadgate',
      post: POST,
      createdAt: LEGACY_DATETIME,
      allow: [{$type: 'app.bsky.feed.threadgate#mentionRule'}],
      hiddenReplies: ['at://did:plc:them/app.bsky.feed.post/3kreply'],
    }

    await expect(
      getThreadgateRecord({pdsClient: clientReturning(record), postUri: POST}),
    ).resolves.toEqual(record)
  })

  it('returns a postgate whose datetime predates strict formatting', async () => {
    const record = {
      $type: 'app.bsky.feed.postgate',
      post: POST,
      createdAt: LEGACY_DATETIME,
      embeddingRules: [{$type: 'app.bsky.feed.postgate#disableRule'}],
      detachedEmbeddingUris: ['at://did:plc:them/app.bsky.feed.post/3kquote'],
    }

    await expect(
      getPostgateRecord({pdsClient: clientReturning(record), postUri: POST}),
    ).resolves.toEqual(record)
  })

  it('still treats a record of the wrong shape as absent', async () => {
    await expect(
      getThreadgateRecord({
        pdsClient: clientReturning({$type: 'app.bsky.feed.threadgate'}),
        postUri: POST,
      }),
    ).resolves.toBeNull()
  })
})
