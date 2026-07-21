import {
  type AppBskyActorDefs,
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
} from '@atproto/api'

import {FeedTuner} from '#/lib/api/feed-manip'

// The repo-wide manual mock stubs CID.parse away, which makes every
// cid-format validation fail; these tests exercise real record validation.
jest.unmock('multiformats/cid')

// Merged community posts arrive from the appview as standard FeedViewPosts
// whose post URIs use the community.blacksky.feed.post collection but whose
// records carry $type app.bsky.feed.post. These tests encode the invariants
// the appview merge must uphold for the standard Following tuner stack to
// render them: record $type normalization and hydrated reply parent/root.

const VIEWER_DID = 'did:plc:viewer'
const MEMBER_DID = 'did:plc:member'
const COLLECTION = 'community.blacksky.feed.post'
const CID = 'bafyreihhl5mpvjkrhnnagen2fomozzhnhhdq2jr6cego2nzbvmwewv5rd4'

function author(
  did: string,
  opts?: {following?: boolean},
): AppBskyActorDefs.ProfileViewBasic {
  return {
    $type: 'app.bsky.actor.defs#profileViewBasic',
    did,
    handle: `${did.split(':').pop()}.blacksky.app`,
    viewer: opts?.following
      ? {following: `at://${VIEWER_DID}/app.bsky.graph.follow/abc`}
      : {},
  }
}

function communityPost(opts: {
  rkey: string
  authorDid?: string
  reply?: {rootUri: string; parentUri: string}
  threadMuted?: boolean
  recordType?: string
}): AppBskyFeedDefs.PostView {
  const did = opts.authorDid ?? MEMBER_DID
  const record: AppBskyFeedPost.Record = {
    $type: (opts.recordType ?? 'app.bsky.feed.post') as 'app.bsky.feed.post',
    text: `post ${opts.rkey}`,
    createdAt: '2026-07-17T12:00:00.000Z',
    ...(opts.reply
      ? {
          reply: {
            root: {uri: opts.reply.rootUri, cid: CID},
            parent: {uri: opts.reply.parentUri, cid: CID},
          },
        }
      : {}),
  }
  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: `at://${did}/${COLLECTION}/${opts.rkey}`,
    cid: CID,
    author: author(did, {following: did !== VIEWER_DID}),
    record,
    indexedAt: '2026-07-17T12:00:00.000Z',
    viewer: opts.threadMuted ? {threadMuted: true} : {},
  }
}

function followingTuner() {
  return new FeedTuner([
    FeedTuner.removeOrphans,
    FeedTuner.followedRepliesOnly({userDid: VIEWER_DID}),
    FeedTuner.dedupThreads,
    FeedTuner.removeMutedThreads,
  ])
}

describe('FeedTuner with merged community posts', () => {
  it('keeps a top-level community post', () => {
    const feed: AppBskyFeedDefs.FeedViewPost[] = [
      {post: communityPost({rkey: 'aaa'})},
    ]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(1)
    expect(slices[0].items[0].post.uri).toContain(COLLECTION)
  })

  it('keeps a community self-reply with hydrated parent and root', () => {
    const root = communityPost({rkey: 'root'})
    const reply = communityPost({
      rkey: 'reply',
      reply: {rootUri: root.uri, parentUri: root.uri},
    })
    const feed: AppBskyFeedDefs.FeedViewPost[] = [
      {
        post: reply,
        reply: {root, parent: root},
      },
    ]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(1)
    expect(slices[0].isOrphan).toBe(false)
    expect(slices[0].items.map(i => i.post.uri)).toEqual([root.uri, reply.uri])
  })

  it('drops a community reply whose parent was not hydrated (orphan)', () => {
    const rootUri = `at://${MEMBER_DID}/${COLLECTION}/root`
    const reply = communityPost({
      rkey: 'reply',
      reply: {rootUri, parentUri: rootUri},
    })
    const feed: AppBskyFeedDefs.FeedViewPost[] = [{post: reply}]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(0)
  })

  it('dedupes slices sharing a community thread root', () => {
    const root = communityPost({rkey: 'root'})
    const reply = communityPost({
      rkey: 'reply',
      reply: {rootUri: root.uri, parentUri: root.uri},
    })
    const feed: AppBskyFeedDefs.FeedViewPost[] = [
      {post: reply, reply: {root, parent: root}},
      {post: root},
    ]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(1)
  })

  it('drops a thread-muted community post', () => {
    const feed: AppBskyFeedDefs.FeedViewPost[] = [
      {post: communityPost({rkey: 'muted', threadMuted: true})},
    ]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(0)
  })

  it('drops items whose record $type is not app.bsky.feed.post', () => {
    // Encodes the appview invariant: buildCommunityPostView must normalize
    // record $type, or merged items silently vanish from feeds.
    const feed: AppBskyFeedDefs.FeedViewPost[] = [
      {post: communityPost({rkey: 'raw', recordType: COLLECTION})},
    ]
    const slices = followingTuner().tune(feed)
    expect(slices).toHaveLength(0)
  })
})
