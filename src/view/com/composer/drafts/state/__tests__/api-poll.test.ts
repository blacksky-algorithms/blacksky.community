import {type AppBskyDraftDefs, RichText} from '@atproto/api'

import {type AssemblyRef} from '#/lib/api/poll'
import {
  type ComposerState,
  type PostDraft,
} from '#/view/com/composer/state/composer'
import {
  composerStateToDraft,
  draftToComposerPosts,
  draftViewToSummary,
} from '../api'

jest.mock('../storage', () => ({
  mediaExists: jest.fn(() => true),
  loadMediaFromLocal: jest.fn(),
  saveMediaToLocal: jest.fn(),
}))
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}))
jest.mock('#/lib/media/manip', () => ({getImageDim: jest.fn()}))
jest.mock('#/lib/media/video/util', () => ({mimeToExt: jest.fn(() => 'mp4')}))
jest.mock('#/lib/deviceName', () => ({getDeviceName: () => 'Test device'}))
jest.mock('#/analytics/identifiers', () => ({getDeviceId: () => 'device-1'}))
jest.mock('#/state/session/agent', () => ({createPublicAgent: jest.fn()}))
jest.mock('#/lib/api/resolve', () => ({resolveLink: jest.fn()}))
jest.mock('#/state/queries/threadgate/util', () => ({
  threadgateAllowUISettingToAllowRecordValue: jest.fn(() => undefined),
}))
jest.mock('#/state/gallery', () => ({}))
jest.mock('#/view/com/composer/state/composer', () => ({
  LEGACY_IMAGES_EMBED_MAX: 4,
}))

const POLL_KEY = 'communityBlackskyPoll'

const pendingRef: AssemblyRef = {
  rkey: '3kassembly',
  createdAt: '2026-09-27T12:00:00.000Z',
  fingerprint: '["question",["first","second"]]',
}

const createdRef: AssemblyRef = {
  ...pendingRef,
  conversationId: '7abcde',
  reportId: 'r7abcde',
}

function savedPoll(draft: AppBskyDraftDefs.Draft, index = 0): unknown {
  return (draft.posts[index] as unknown as Record<string, unknown>)[POLL_KEY]
}

function asStored(draft: AppBskyDraftDefs.Draft): AppBskyDraftDefs.Draft {
  return JSON.parse(JSON.stringify(draft)) as AppBskyDraftDefs.Draft
}

function post(embed: Partial<PostDraft['embed']>, text = ''): PostDraft {
  return {
    id: 'p',
    richtext: new RichText({text}),
    shortenedGraphemeLength: text.length,
    labels: [],
    embed: {quote: undefined, link: undefined, media: undefined, ...embed},
  }
}

function state(posts: PostDraft[]): ComposerState {
  return {
    activePostIndex: 0,
    mutableNeedsFocusActive: false,
    isDirty: true,
    thread: {
      posts,
      postgate: {} as never,
      threadgate: [],
      blackskyOnly: false,
    },
  }
}

function draftPost(extra: Record<string, unknown>): AppBskyDraftDefs.DraftPost {
  return {
    $type: 'app.bsky.draft.defs#draftPost',
    text: 'hello',
    ...extra,
  }
}

function draftOf(posts: AppBskyDraftDefs.DraftPost[]): AppBskyDraftDefs.Draft {
  return {$type: 'app.bsky.draft.defs#draft', posts}
}

describe('draft polls', () => {
  it('serialises the poll as an extra property on the draft post', async () => {
    const {draft} = await composerStateToDraft(
      state([post({poll: {statements: ['one', '']}}, 'question')]),
    )
    expect(savedPoll(draft)).toStrictEqual({statements: ['one', '']})
  })

  it('serialises the assembly reference with the statements', async () => {
    const {draft} = await composerStateToDraft(
      state([
        post(
          {poll: {statements: ['first', 'second'], assembly: createdRef}},
          'question',
        ),
      ]),
    )
    expect(savedPoll(draft)).toStrictEqual({
      statements: ['first', 'second'],
      assembly: {
        rkey: '3kassembly',
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint: '["question",["first","second"]]',
        conversationId: '7abcde',
        reportId: 'r7abcde',
      },
    })
  })

  it('serialises the poll of the post that has one', async () => {
    const {draft} = await composerStateToDraft(
      state([
        post({}, 'lead'),
        post({poll: {statements: ['first'], assembly: pendingRef}}, 'question'),
      ]),
    )
    expect(POLL_KEY in draft.posts[0]).toBe(false)
    expect(savedPoll(draft, 1)).toStrictEqual({
      statements: ['first'],
      assembly: pendingRef,
    })
  })

  it('omits the property when there is no poll', async () => {
    const {draft} = await composerStateToDraft(state([post({}, 'text only')]))
    expect(POLL_KEY in draft.posts[0]).toBe(false)
  })

  it('restores a poll, including unfinished and oversized statements', async () => {
    const oversized = 'a' + '\u0301'.repeat(2000)
    const {posts} = await draftToComposerPosts(
      draftOf([draftPost({[POLL_KEY]: {statements: ['', oversized]}})]),
      new Map(),
    )
    expect(posts[0].embed.poll).toEqual({statements: ['', oversized]})
  })

  it('round-trips a poll through save and restore', async () => {
    const {draft} = await composerStateToDraft(
      state([post({poll: {statements: ['first', 'second']}}, 'question')]),
    )
    const {posts} = await draftToComposerPosts(asStored(draft), new Map())
    expect(posts[0].embed.poll).toEqual({statements: ['first', 'second']})
    expect(posts[0].embed.poll?.assembly).toBeUndefined()
    expect(posts[0].richtext.text).toBe('question')
  })

  it.each([
    {kind: 'an assembly that was created', assembly: createdRef},
    {kind: 'an assembly that is still being created', assembly: pendingRef},
  ])('round-trips the reference to $kind', async ({assembly}) => {
    const {draft} = await composerStateToDraft(
      state([
        post({poll: {statements: ['first', 'second'], assembly}}, 'question'),
      ]),
    )
    const {posts} = await draftToComposerPosts(asStored(draft), new Map())

    expect(posts[0].embed.poll).toEqual({
      statements: ['first', 'second'],
      assembly,
    })
    expect(posts[0].embed.poll?.assembly?.conversationId).toBe(
      assembly.conversationId,
    )
    expect(posts[0].embed.poll?.assembly?.reportId).toBe(assembly.reportId)
  })

  it('round-trips a saved reference through a second save', async () => {
    const first = await composerStateToDraft(
      state([
        post(
          {poll: {statements: ['first', 'second'], assembly: pendingRef}},
          'question',
        ),
      ]),
    )
    const restored = await draftToComposerPosts(
      asStored(first.draft),
      new Map(),
    )
    const second = await composerStateToDraft(state(restored.posts))

    expect(asStored(second.draft).posts[0]).toHaveProperty(POLL_KEY, {
      statements: ['first', 'second'],
      assembly: pendingRef,
    })
  })

  it('restores the statements when the reference is malformed', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [POLL_KEY]: {
            statements: ['a'],
            assembly: {rkey: '3kassembly', createdAt: 42},
          },
        }),
        draftPost({[POLL_KEY]: {statements: ['b'], assembly: 'nope'}}),
      ]),
      new Map(),
    )
    expect(posts.map(p => p.embed.poll)).toEqual([
      {statements: ['a']},
      {statements: ['b']},
    ])
    expect(posts[0].embed.poll?.assembly).toBeUndefined()
    expect(posts[1].embed.poll?.assembly).toBeUndefined()
  })

  it('ignores a malformed poll property', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({[POLL_KEY]: {statements: null}}),
        draftPost({[POLL_KEY]: {statements: [42]}}),
        draftPost({[POLL_KEY]: 'nope'}),
      ]),
      new Map(),
    )
    expect(posts.map(p => p.embed.poll)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('drops the poll when the restored post also has a gif', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [POLL_KEY]: {statements: ['a'], assembly: createdRef},
          embedExternals: [
            {uri: 'https://media.tenor.com/abc/clip.gif?hh=100&ww=200&alt=hi'},
          ],
        }),
      ]),
      new Map(),
    )
    expect(posts[0].embed.media?.type).toBe('gif')
    expect(posts[0].embed.poll).toBeUndefined()
  })

  it('drops the poll when the restored post also has a quote', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [POLL_KEY]: {statements: ['a']},
          embedRecords: [
            {
              record: {
                uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc',
                cid: 'bafyreicid',
              },
            },
          ],
        }),
      ]),
      new Map(),
    )
    expect(posts[0].embed.quote).toBeDefined()
    expect(posts[0].embed.poll).toBeUndefined()
  })

  it('drops the poll when the restored post also has a link', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [POLL_KEY]: {statements: ['a']},
          embedExternals: [{uri: 'https://example.com/article'}],
        }),
      ]),
      new Map(),
    )
    expect(posts[0].embed.link).toBeDefined()
    expect(posts[0].embed.poll).toBeUndefined()
  })

  it('drops the poll when a video is pending restoration', async () => {
    const path = 'video:video/mp4:abc.mp4'
    const {posts, restoredVideos} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [POLL_KEY]: {statements: ['a']},
          embedVideos: [{localRef: {path}}],
        }),
      ]),
      new Map([[path, 'file://abc.mp4']]),
    )
    expect(restoredVideos.has(0)).toBe(true)
    expect(posts[0].embed.media).toBeUndefined()
    expect(posts[0].embed.poll).toBeUndefined()
  })

  it('saves a poll draft whatever its size', async () => {
    const text = '\u4e2d'.repeat(1000)
    const statements = [...Array(10).keys()].map(index =>
      String(index).repeat(400),
    )
    const {draft} = await composerStateToDraft(
      state([
        post({poll: {statements, assembly: createdRef}}, 'question'),
        ...Array.from({length: 31}, () => post({}, text)),
      ]),
    )

    expect(draft.posts).toHaveLength(32)
    expect(Buffer.byteLength(JSON.stringify(draft))).toBeGreaterThan(90_000)
    expect(savedPoll(draft)).toStrictEqual({statements, assembly: createdRef})
  })

  it('includes the poll in the draft list summary', () => {
    const summary = draftViewToSummary({
      view: {
        id: 'draft-1',
        createdAt: '2026-09-27T00:00:00.000Z',
        updatedAt: '2026-09-27T00:00:00.000Z',
        draft: draftOf([
          draftPost({
            [POLL_KEY]: {statements: ['shown', ''], assembly: createdRef},
          }),
          draftPost({}),
        ]),
      },
      analytics: {logger: {warn: jest.fn()}} as never,
    })
    expect(summary.posts[0].poll).toEqual({
      statements: ['shown', ''],
      assembly: createdRef,
    })
    expect(summary.posts[1].poll).toBeUndefined()
  })
})
