import {describe, expect, it} from '@jest/globals'
import {
  type AppBskyActorDefs,
  type AppBskyFeedDefs,
} from '@atproto/api'

import {FeedTuner} from '#/lib/api/feed-manip'

function makeAuthor(did: string): AppBskyActorDefs.ProfileViewBasic {
  return {did, handle: `${did}.test`} as AppBskyActorDefs.ProfileViewBasic
}

let __postRkeyCounter = 0

function makePostView(opts: {
  authorDid: string
  embed?: unknown
  record?: unknown
  rkey?: string
}): AppBskyFeedDefs.PostView {
  __postRkeyCounter += 1
  const rkey = opts.rkey ?? `rkey-${__postRkeyCounter}`
  return {
    uri: `at://${opts.authorDid}/app.bsky.feed.post/${rkey}`,
    cid: 'bafyreid',
    author: makeAuthor(opts.authorDid),
    record: opts.record ?? {
      $type: 'app.bsky.feed.post',
      text: 'hello',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    indexedAt: '2020-01-01T00:00:00.000Z',
    embed: opts.embed as AppBskyFeedDefs.PostView['embed'],
    labels: [],
    viewer: {threadMuted: false} as AppBskyFeedDefs.PostView['viewer'],
  } as unknown as AppBskyFeedDefs.PostView
}

function makeRepost(
  authorDid: string,
  reposterDid: string,
): AppBskyFeedDefs.FeedViewPost {
  return {
    post: makePostView({authorDid}),
    reason: {
      $type: 'app.bsky.feed.defs#reasonRepost',
      by: makeAuthor(reposterDid),
      indexedAt: '2020-01-01T00:00:00.000Z',
    },
  } as unknown as AppBskyFeedDefs.FeedViewPost
}

function makeQuote(
  authorDid: string,
  embeddedAuthorDid: string,
): AppBskyFeedDefs.FeedViewPost {
  return {
    post: makePostView({
      authorDid,
      embed: {
        $type: 'app.bsky.embed.record#view',
        record: {
          $type: 'app.bsky.embed.record#viewRecord',
          author: makeAuthor(embeddedAuthorDid),
          value: {text: 'embedded', $type: 'app.bsky.feed.post'},
          uri: `at://${embeddedAuthorDid}/app.bsky.feed.post/rkey`,
          cid: 'bafyreid',
          indexedAt: '2020-01-01T00:00:00.000Z',
        },
      },
    }),
  } as unknown as AppBskyFeedDefs.FeedViewPost
}

function makePlain(authorDid: string): AppBskyFeedDefs.FeedViewPost {
  return {
    post: makePostView({authorDid}),
  } as unknown as AppBskyFeedDefs.FeedViewPost
}

function postUri(item: AppBskyFeedDefs.FeedViewPost): string {
  return item.post.uri
}

describe('FeedTuner.removeAuthorReposts', () => {
  it('drops only slices whose reason.by.did matches', () => {
    const feed = [
      makeRepost('did:plc:author', 'did:plc:blocked'),
      makeRepost('did:plc:author', 'did:plc:other'),
      makePlain('did:plc:author'),
    ]
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorReposts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune(feed, {dryRun: false})
    expect(out.map(s => postUri(s._feedPost))).toEqual([postUri(feed[1]), postUri(feed[2])])
  })

  it('preserves order of remaining slices', () => {
    const a = makeRepost('did:plc:author', 'did:plc:blocked')
    const b = makeRepost('did:plc:author', 'did:plc:blocked')
    const c = makeRepost('did:plc:author', 'did:plc:other')
    const d = makeRepost('did:plc:author', 'did:plc:blocked')
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorReposts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([a, b, c, d], {dryRun: false})
    expect(out).toHaveLength(1)
    expect(out[0]._feedPost).toBe(c)
  })

  it('does not touch slices with no reason', () => {
    const a = makePlain('did:plc:author')
    const b = makePlain('did:plc:author')
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorReposts({did: 'did:plc:anyone'}),
    ])
    const out = tuner.tune([a, b], {dryRun: false})
    expect(out).toHaveLength(2)
  })

  it('composes with removeReposts to drop all reposts', () => {
    const matched = makeRepost('did:plc:author', 'did:plc:blocked')
    const other = makeRepost('did:plc:author', 'did:plc:other')
    const plain = makePlain('did:plc:author')
    const tuner = new FeedTuner([
      FeedTuner.removeReposts,
      FeedTuner.removeAuthorReposts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([matched, other, plain], {dryRun: false})
    expect(out).toHaveLength(1)
    expect(out[0]._feedPost).toBe(plain)
  })
})

describe('FeedTuner.removeAuthorQuotePosts', () => {
  it('drops only slices whose author.did matches', () => {
    const blockedQ = makeQuote('did:plc:blocked', 'did:plc:other')
    const otherQ = makeQuote('did:plc:other', 'did:plc:blocked')
    const thirdQ = makeQuote('did:plc:third', 'did:plc:author')
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorQuotePosts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([blockedQ, otherQ, thirdQ], {dryRun: false})
    expect(out.map(s => postUri(s._feedPost))).toEqual([postUri(otherQ), postUri(thirdQ)])
  })

  it('preserves order of remaining slices', () => {
    const a = makeQuote('did:plc:blocked', 'did:plc:x')
    const b = makeQuote('did:plc:other', 'did:plc:y')
    const c = makeQuote('did:plc:blocked', 'did:plc:z')
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorQuotePosts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([a, b, c], {dryRun: false})
    expect(out).toHaveLength(1)
    expect(out[0]._feedPost).toBe(b)
  })

  it('does not touch non-quote slices', () => {
    const a = makePlain('did:plc:blocked')
    const b = makePlain('did:plc:blocked')
    const tuner = new FeedTuner([
      FeedTuner.removeAuthorQuotePosts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([a, b], {dryRun: false})
    expect(out).toHaveLength(2)
  })

  it('composes with removeQuotePosts to drop all quotes', () => {
    const blockedQ = makeQuote('did:plc:blocked', 'did:plc:x')
    const otherQ = makeQuote('did:plc:other', 'did:plc:y')
    const plain = makePlain('did:plc:author')
    const tuner = new FeedTuner([
      FeedTuner.removeQuotePosts,
      FeedTuner.removeAuthorQuotePosts({did: 'did:plc:blocked'}),
    ])
    const out = tuner.tune([blockedQ, otherQ, plain], {dryRun: false})
    expect(out).toHaveLength(1)
    expect(out[0]._feedPost).toBe(plain)
  })
})
