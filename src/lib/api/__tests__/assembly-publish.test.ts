import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {logger} from '#/logger'
import {fetchResolveLinkQuery} from '#/state/queries/resolve-link'
import {AssemblyError, ensureAssembly} from '../assembly'
import {admitFeedPost, fetchCommunityFeedTarget} from '../community-feed'
import {post, ReplyDeletedError, resolveEmbed} from '../index'
import {type AssemblyRef} from '../poll'
import {imageToThumb} from '../resolve'
import {postToSpace} from '../space-post'
import {uploadBlob} from '../upload-blob'

jest.mock('#/state/gallery', () => ({compressImage: jest.fn()}))
jest.mock('#/state/queries/resolve-link', () => ({
  fetchResolveGifQuery: jest.fn(),
  fetchResolveLinkQuery: jest.fn(),
}))
jest.mock('#/state/queries/threadgate', () => ({
  createThreadgateRecord: jest.fn(),
  threadgateAllowUISettingToAllowRecordValue: jest.fn(() => []),
}))
jest.mock(
  '@ipld/dag-cbor',
  () => ({encode: (v: unknown) => Buffer.from(JSON.stringify(v))}),
  {virtual: true},
)
jest.mock('multiformats/cid', () => ({
  CID: {createV1: () => ({toString: () => 'bafyreifake'})},
}))
jest.mock('#/env', () => ({
  ...jest.requireActual<Record<string, unknown>>('#/env'),
  ASSEMBLY_URL: 'https://assembly.blacksky.community',
}))
jest.mock('../assembly', () => ({
  ...jest.requireActual<Record<string, unknown>>('../assembly'),
  ensureAssembly: jest.fn(),
}))
jest.mock('../community-feed', () => ({
  ...jest.requireActual<Record<string, unknown>>('../community-feed'),
  admitFeedPost: jest.fn(),
  fetchCommunityFeedTarget: jest.fn(),
}))
jest.mock('../resolve', () => ({imageToThumb: jest.fn()}))
jest.mock('../space-post', () => ({postToSpace: jest.fn()}))
jest.mock('../upload-blob', () => ({uploadBlob: jest.fn()}))

const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'
const FEED = 'at://did:plc:community/app.bsky.feed.generator/3m2feed'
const PUBLIC_PARENT = 'at://did:plc:bob/app.bsky.feed.post/3kparent'
const COMMUNITY_PARENT =
  'at://did:plc:bob/community.blacksky.feed.post/3kparent'
const SPACE_PARENT = `${SPACE}/did:plc:bob/app.bsky.feed.post/3kparent`

const TOPIC = 'Should the garden stay open late?'
const STATEMENTS = ['Yes, until sunset', 'Only on weekends']
const REF: AssemblyRef = {
  rkey: '3m2kqzvnqbc2a',
  createdAt: '2026-09-27T12:00:00.000Z',
  fingerprint:
    '["Should the garden stay open late?",["Yes, until sunset","Only on weekends"]]',
}
const CREATED_REF = {...REF, conversationId: '2demo', reportId: 'r7report'}
const CARD = {
  uri: 'https://assembly.blacksky.community/2demo',
  title: 'Should the garden stay open late?',
  description: '1. Yes, until sunset\n2. Only on weekends',
}
const THUMB_URL = 'https://assembly.blacksky.community/api/v3/og-image/2demo'
const THUMB = {
  alt: '',
  source: {
    id: 'thumb',
    path: 'file:///cache/thumb.png',
    width: 1200,
    height: 630,
    mime: 'image/png',
  },
}
const THUMB_BLOB = {
  $type: 'blob',
  ref: {$link: 'bafkreithumb'},
  mimeType: 'image/png',
  size: 1234,
}
const POLLS_ARE_PUBLIC = 'Polls are only available on public posts.'
const NO_THUMB = 'Failed to attach the poll thumbnail'
const NO_IMAGE = 'The image could not be read in time'

type Write = {
  collection: string
  rkey: string
  value: {
    text: string
    reply?: unknown
    embed?: {$type: string; external: Record<string, unknown>}
  }
}

const mockEnsureAssembly = jest.mocked(ensureAssembly)
const mockImageToThumb = jest.mocked(imageToThumb)
const mockUploadBlob = jest.mocked(uploadBlob)
const mockPostToSpace = jest.mocked(postToSpace)
const mockFetchFeedTarget = jest.mocked(fetchCommunityFeedTarget)
const mockAdmitFeedPost = jest.mocked(admitFeedPost)

const queryClient = {invalidateQueries: jest.fn()} as unknown as QueryClient

let events: string[]
let warn: jest.SpyInstance

function setup() {
  const fetchHandler = jest.fn()
  const applyWrites = jest.fn(() => {
    events.push('applyWrites')
    return Promise.resolve({})
  })
  const getPosts = jest.fn(() => {
    events.push('getPosts')
    return Promise.resolve({
      data: {
        posts: [
          {
            uri: PUBLIC_PARENT,
            cid: 'bafyreiparent',
            record: {
              $type: 'app.bsky.feed.post',
              text: 'hi',
              createdAt: '2026-09-27T11:00:00.000Z',
            },
          },
        ],
      },
    })
  })
  const onStateChange = jest.fn((state: string) => {
    events.push(`stage:${state}`)
  })
  const onAssembly = jest.fn()
  const agent = {
    assertDid: 'did:plc:alice',
    fetchHandler,
    com: {atproto: {repo: {applyWrites}}},
    app: {bsky: {feed: {getPosts}}},
  } as unknown as AtpAgent
  return {agent, fetchHandler, applyWrites, getPosts, onStateChange, onAssembly}
}

function draft(embed: Record<string, unknown>, text = TOPIC, id = 'post-1') {
  return {
    id,
    richtext: {text, facets: []},
    shortenedGraphemeLength: text.length,
    labels: [],
    embed,
  }
}

function thread(posts: unknown[], extra: Record<string, unknown> = {}) {
  return {
    posts,
    postgate: {},
    threadgate: [],
    blackskyOnly: false,
    ...extra,
  } as never
}

function pollThread(extra: Record<string, unknown> = {}) {
  return thread([draft({poll: {statements: STATEMENTS}})], extra)
}

function feedTarget(contentType: string, space?: string) {
  return {
    feed: FEED,
    name: 'Garden',
    serviceDid: 'did:web:feeds.example.com',
    config: {
      $type: 'community.blacksky.feed.config',
      contentType,
      visibility: 'gated',
      group: 'at://did:plc:community/community.blacksky.group/community',
      createdAt: '2026-08-09T12:00:00.000Z',
      ...(space ? {space} : {}),
    },
  }
}

function writesOf(applyWrites: jest.Mock): Write[] {
  const [{writes}] = applyWrites.mock.calls[0] as unknown as [{writes: Write[]}]
  return writes
}

function settle() {
  return new Promise(resolve => setImmediate(resolve))
}

function expectNothingStarted(setupResult: ReturnType<typeof setup>) {
  expect(mockEnsureAssembly).not.toHaveBeenCalled()
  expect(mockImageToThumb).not.toHaveBeenCalled()
  expect(mockUploadBlob).not.toHaveBeenCalled()
  expect(mockPostToSpace).not.toHaveBeenCalled()
  expect(setupResult.applyWrites).not.toHaveBeenCalled()
  expect(setupResult.fetchHandler).not.toHaveBeenCalled()
  expect(setupResult.getPosts).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.resetAllMocks()
  events = []
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => {})
  mockEnsureAssembly.mockImplementation((agent, input) => {
    events.push('ensureAssembly')
    input.onRef(REF)
    input.onRef(CREATED_REF)
    return Promise.resolve({ref: CREATED_REF, isReplay: false})
  })
  mockImageToThumb.mockImplementation(() => {
    events.push('imageToThumb')
    return Promise.resolve(THUMB as never)
  })
  mockUploadBlob.mockImplementation(() => {
    events.push('uploadBlob')
    return Promise.resolve({data: {blob: THUMB_BLOB}} as never)
  })
  mockPostToSpace.mockResolvedValue({uris: ['at://space/post']})
})

afterEach(() => {
  jest.useRealTimers()
  warn.mockRestore()
})

describe('publishing a post with a poll', () => {
  it('writes the post with a link card to the assembly', async () => {
    const ctx = setup()

    const result = await post(ctx.agent, queryClient, {
      thread: thread([
        draft(
          {poll: {statements: ['  Yes, until sunset ', 'Only on weekends']}},
          'Should the garden\nstay open late?',
        ),
      ]),
      onStateChange: ctx.onStateChange,
      onAssembly: ctx.onAssembly,
    })

    expect(ctx.applyWrites).toHaveBeenCalledTimes(1)
    const writes = writesOf(ctx.applyWrites)
    expect(writes).toHaveLength(1)
    expect(writes[0].collection).toBe('app.bsky.feed.post')
    expect(writes[0].value.text).toBe('Should the garden\nstay open late?')
    expect(writes[0].value.embed).toStrictEqual({
      $type: 'app.bsky.embed.external',
      external: {...CARD, thumb: THUMB_BLOB},
    })
    expect(result).toStrictEqual({
      uris: [`at://did:plc:alice/app.bsky.feed.post/${writes[0].rkey}`],
      assembly: {conversationId: '2demo', statementCount: 2, isReplay: false},
    })
  })

  it('starts the assembly with the topic, statements and stored reference', async () => {
    const ctx = setup()

    await post(ctx.agent, queryClient, {
      thread: thread([
        draft(
          {
            poll: {
              statements: ['  Yes, until sunset ', 'Only on weekends'],
              assembly: REF,
            },
          },
          'Should the garden\nstay open late?',
        ),
      ]),
    })

    expect(mockEnsureAssembly).toHaveBeenCalledTimes(1)
    expect(mockEnsureAssembly).toHaveBeenCalledWith(ctx.agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: REF,
      onRef: expect.any(Function),
    })
  })

  it('creates the assembly and its thumbnail before writing the post', async () => {
    const ctx = setup()

    await post(ctx.agent, queryClient, {
      thread: pollThread(),
      onStateChange: ctx.onStateChange,
    })

    expect(events).toEqual([
      'stage:Processing...',
      'stage:Starting poll...',
      'ensureAssembly',
      'imageToThumb',
      'stage:Uploading link thumbnail...',
      'uploadBlob',
      'applyWrites',
    ])
    expect(mockImageToThumb).toHaveBeenCalledWith(THUMB_URL)
    expect(mockUploadBlob).toHaveBeenCalledWith(
      ctx.agent,
      'file:///cache/thumb.png',
      'image/png',
    )
    expect(fetchResolveLinkQuery).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports every change of the reference with the id of the poll post', async () => {
    const ctx = setup()

    await post(ctx.agent, queryClient, {
      thread: pollThread(),
      onAssembly: ctx.onAssembly,
    })

    expect(ctx.onAssembly.mock.calls).toEqual([
      ['post-1', REF],
      ['post-1', CREATED_REF],
    ])
  })

  it('builds the card from the assembly that was returned, and reports a replay', async () => {
    const ctx = setup()
    const stored = {...REF, conversationId: '1stale'}
    mockEnsureAssembly.mockResolvedValue({ref: CREATED_REF, isReplay: true})

    const result = await post(ctx.agent, queryClient, {
      thread: thread([
        draft({poll: {statements: STATEMENTS, assembly: stored}}),
      ]),
      onAssembly: ctx.onAssembly,
    })

    expect(mockEnsureAssembly).toHaveBeenCalledWith(
      ctx.agent,
      expect.objectContaining({ref: stored}),
    )
    expect(writesOf(ctx.applyWrites)[0].value.embed?.external.uri).toBe(
      CARD.uri,
    )
    expect(result.assembly).toStrictEqual({
      conversationId: '2demo',
      statementCount: 2,
      isReplay: true,
    })
    expect(ctx.onAssembly).not.toHaveBeenCalled()
  })

  it('rethrows a failed assembly unchanged and writes nothing', async () => {
    const ctx = setup()
    const error = new AssemblyError('quota', 'create')
    mockEnsureAssembly.mockImplementation((agent, input) => {
      input.onRef(REF)
      return Promise.reject(error)
    })

    await expect(
      post(ctx.agent, queryClient, {
        thread: pollThread(),
        onAssembly: ctx.onAssembly,
      }),
    ).rejects.toBe(error)

    expect(ctx.onAssembly.mock.calls).toEqual([['post-1', REF]])
    expect(ctx.applyWrites).not.toHaveBeenCalled()
    expect(mockImageToThumb).not.toHaveBeenCalled()
    expect(mockUploadBlob).not.toHaveBeenCalled()
  })

  it('leaves a post without a poll alone', async () => {
    const ctx = setup()

    const result = await post(ctx.agent, queryClient, {
      thread: thread([draft({})]),
      onStateChange: ctx.onStateChange,
      onAssembly: ctx.onAssembly,
    })

    const writes = writesOf(ctx.applyWrites)
    expect(writes[0].value.embed).toBeUndefined()
    expect(result).toStrictEqual({
      uris: [`at://did:plc:alice/app.bsky.feed.post/${writes[0].rkey}`],
      assembly: undefined,
    })
    expect(events).toEqual(['stage:Processing...', 'applyWrites'])
    expect(mockEnsureAssembly).not.toHaveBeenCalled()
    expect(ctx.onAssembly).not.toHaveBeenCalled()
  })

  it('uses the text of the post that carries the poll as the topic', async () => {
    const ctx = setup()

    const result = await post(ctx.agent, queryClient, {
      thread: thread([
        draft({}, 'Some context first', 'post-1'),
        draft({poll: {statements: STATEMENTS}}, TOPIC, 'post-2'),
      ]),
      onAssembly: ctx.onAssembly,
    })

    expect(mockEnsureAssembly).toHaveBeenCalledWith(
      ctx.agent,
      expect.objectContaining({topic: TOPIC, statements: STATEMENTS}),
    )
    expect(ctx.onAssembly.mock.calls).toEqual([
      ['post-2', REF],
      ['post-2', CREATED_REF],
    ])
    const writes = writesOf(ctx.applyWrites)
    expect(writes.map(w => w.value.text)).toEqual(['Some context first', TOPIC])
    expect(writes[0].value.embed).toBeUndefined()
    expect(writes[1].value.embed).toStrictEqual({
      $type: 'app.bsky.embed.external',
      external: {...CARD, thumb: THUMB_BLOB},
    })
    const first = {uri: result.uris[0], cid: 'bafyreifake'}
    expect(writes[1].value.reply).toEqual({root: first, parent: first})
  })

  it('admits a poll post to a feed of public records', async () => {
    const ctx = setup()
    const target = feedTarget('publicRecord')

    const result = await post(ctx.agent, queryClient, {
      thread: pollThread({communityFeed: target}),
    })

    expect(writesOf(ctx.applyWrites)[0].value.embed?.external.uri).toBe(
      CARD.uri,
    )
    expect(mockAdmitFeedPost).toHaveBeenCalledTimes(1)
    expect(mockAdmitFeedPost).toHaveBeenCalledWith(
      ctx.agent,
      target,
      result.uris[0],
      'bafyreifake',
    )
  })
})

describe('replying with a poll', () => {
  it('waits for the parent before starting the assembly', async () => {
    const ctx = setup()
    let release: (value: unknown) => void = () => {}
    ctx.getPosts.mockImplementation(() => {
      events.push('getPosts')
      return new Promise(resolve => {
        release = resolve
      }) as never
    })

    const pending = post(ctx.agent, queryClient, {
      thread: pollThread(),
      replyTo: PUBLIC_PARENT,
      onStateChange: ctx.onStateChange,
    })
    await settle()

    expect(events).toEqual(['stage:Processing...', 'getPosts'])

    release({data: {posts: [{uri: PUBLIC_PARENT, cid: 'bafyreiparent'}]}})
    await pending

    expect(events).toEqual([
      'stage:Processing...',
      'getPosts',
      'stage:Starting poll...',
      'ensureAssembly',
      'imageToThumb',
      'stage:Uploading link thumbnail...',
      'uploadBlob',
      'applyWrites',
    ])
    const parent = {uri: PUBLIC_PARENT, cid: 'bafyreiparent'}
    expect(writesOf(ctx.applyWrites)[0].value.reply).toEqual({
      root: parent,
      parent,
    })
  })

  it('starts no assembly when the parent is gone', async () => {
    const ctx = setup()
    ctx.getPosts.mockImplementation(() =>
      Promise.resolve({data: {posts: []}} as never),
    )

    await expect(
      post(ctx.agent, queryClient, {
        thread: pollThread(),
        replyTo: PUBLIC_PARENT,
        onStateChange: ctx.onStateChange,
        onAssembly: ctx.onAssembly,
      }),
    ).rejects.toBeInstanceOf(ReplyDeletedError)

    expect(events).toEqual(['stage:Processing...'])
    expect(mockEnsureAssembly).not.toHaveBeenCalled()
    expect(ctx.onAssembly).not.toHaveBeenCalled()
    expect(ctx.applyWrites).not.toHaveBeenCalled()
  })
})

describe('the poll thumbnail', () => {
  it.each([
    {
      name: 'the image cannot be read',
      arrange: () => mockImageToThumb.mockResolvedValue(undefined),
      uploads: 0,
      reason: NO_IMAGE,
    },
    {
      name: 'fetching the image throws',
      arrange: () => mockImageToThumb.mockRejectedValue(new Error('offline')),
      uploads: 0,
      reason: 'offline',
    },
    {
      name: 'the upload fails',
      arrange: () => mockUploadBlob.mockRejectedValue(new Error('too large')),
      uploads: 1,
      reason: 'too large',
    },
  ])('is left off when $name', async ({arrange, uploads, reason}) => {
    const ctx = setup()
    arrange()

    const result = await post(ctx.agent, queryClient, {thread: pollThread()})

    expect(mockUploadBlob).toHaveBeenCalledTimes(uploads)
    expect(ctx.applyWrites).toHaveBeenCalledTimes(1)
    expect(writesOf(ctx.applyWrites)[0].value.embed).toStrictEqual({
      $type: 'app.bsky.embed.external',
      external: {...CARD, thumb: undefined},
    })
    expect(result.assembly).toStrictEqual({
      conversationId: '2demo',
      statementCount: 2,
      isReplay: false,
    })
    expect(warn.mock.calls).toEqual([[NO_THUMB, {safeMessage: reason}]])
  })

  it('is given up after five seconds', async () => {
    jest.useFakeTimers()
    const ctx = setup()
    mockImageToThumb.mockImplementation(() => new Promise(() => {}))

    const pending = post(ctx.agent, queryClient, {thread: pollThread()})

    await jest.advanceTimersByTimeAsync(4999)
    expect(mockImageToThumb).toHaveBeenCalledWith(THUMB_URL)
    expect(ctx.applyWrites).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)
    await pending

    expect(mockUploadBlob).not.toHaveBeenCalled()
    expect(writesOf(ctx.applyWrites)[0].value.embed).toStrictEqual({
      $type: 'app.bsky.embed.external',
      external: {...CARD, thumb: undefined},
    })
    expect(warn.mock.calls).toEqual([[NO_THUMB, {safeMessage: NO_IMAGE}]])
  })

  it('leaves no timer behind once the image arrives', async () => {
    jest.useFakeTimers()
    const ctx = setup()

    await post(ctx.agent, queryClient, {thread: pollThread()})

    expect(mockUploadBlob).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('a poll outside the public path', () => {
  it.each([
    {name: 'a Blacksky Only post', extra: {blackskyOnly: true}},
    {
      name: 'a community feed',
      extra: {communityFeed: feedTarget('communityRecord')},
    },
    {name: 'a reply to a community post', replyTo: COMMUNITY_PARENT},
    {name: 'a private space', extra: {communitySpaceUri: SPACE}},
    {name: 'a reply to a space post', replyTo: SPACE_PARENT},
    {
      name: 'a feed backed by a space',
      extra: {communityFeed: feedTarget('communityRecord', SPACE)},
    },
  ])('is refused for $name before anything starts', async input => {
    const ctx = setup()

    await expect(
      post(ctx.agent, queryClient, {
        thread: pollThread(input.extra),
        replyTo: input.replyTo,
        onAssembly: ctx.onAssembly,
      }),
    ).rejects.toThrow(new Error(POLLS_ARE_PUBLIC))

    expectNothingStarted(ctx)
    expect(ctx.onAssembly).not.toHaveBeenCalled()
  })

  it('is refused when any post of the thread has one', async () => {
    const ctx = setup()

    await expect(
      post(ctx.agent, queryClient, {
        thread: thread(
          [
            draft({}, 'Some context first', 'post-1'),
            draft({poll: {statements: STATEMENTS}}, TOPIC, 'post-2'),
          ],
          {blackskyOnly: true},
        ),
      }),
    ).rejects.toThrow(new Error(POLLS_ARE_PUBLIC))

    expectNothingStarted(ctx)
  })

  it('is refused for a quote of a community post', async () => {
    const ctx = setup()

    await expect(
      post(ctx.agent, queryClient, {
        thread: thread([
          draft({
            poll: {statements: STATEMENTS},
            quote: {type: 'link', uri: COMMUNITY_PARENT},
          }),
        ]),
      }),
    ).rejects.toThrow(new Error(POLLS_ARE_PUBLIC))

    expectNothingStarted(ctx)
  })

  it('is refused for a community feed that is looked up at publish', async () => {
    const ctx = setup()
    mockFetchFeedTarget.mockResolvedValue(
      feedTarget('communityRecord') as never,
    )

    await expect(
      post(ctx.agent, queryClient, {
        thread: pollThread({communityFeedUri: FEED}),
      }),
    ).rejects.toThrow(new Error(POLLS_ARE_PUBLIC))

    expect(mockFetchFeedTarget).toHaveBeenCalledWith(ctx.agent, FEED)
    expectNothingStarted(ctx)
  })
})

describe('a poll with another attachment', () => {
  const COMBINED =
    'A poll cannot be combined with media, a link card or a quote.'
  const attachments = [
    {name: 'media', extra: {media: {type: 'gif', gif: {}, alt: ''}}},
    {
      name: 'a link card',
      extra: {link: {type: 'link', uri: 'https://example.com'}},
    },
    {
      name: 'a quote',
      extra: {
        quote: {type: 'link', uri: 'https://bsky.app/profile/a.test/post/3k'},
      },
    },
  ]

  it.each(attachments)(
    'is refused with $name before anything starts',
    async ({extra}) => {
      const ctx = setup()

      await expect(
        post(ctx.agent, queryClient, {
          thread: thread([draft({poll: {statements: STATEMENTS}, ...extra})]),
        }),
      ).rejects.toThrow(new Error(COMBINED))

      expectNothingStarted(ctx)
    },
  )

  it.each(attachments)(
    'is refused with $name when the embed is built',
    async ({extra}) => {
      const ctx = setup()

      await expect(
        resolveEmbed(
          ctx.agent,
          queryClient,
          draft({
            poll: {statements: STATEMENTS, assembly: CREATED_REF},
            ...extra,
          }) as never,
          undefined,
        ),
      ).rejects.toThrow(new Error(COMBINED))

      expect(mockImageToThumb).not.toHaveBeenCalled()
      expect(fetchResolveLinkQuery).not.toHaveBeenCalled()
    },
  )
})

describe('poll invariants', () => {
  it('refuses two polls in one thread before anything starts', async () => {
    const ctx = setup()

    await expect(
      post(ctx.agent, queryClient, {
        thread: thread([
          draft({poll: {statements: STATEMENTS}}, TOPIC, 'post-1'),
          draft({poll: {statements: ['Another']}}, 'Second', 'post-2'),
        ]),
      }),
    ).rejects.toThrow(new Error('A thread can only have one poll.'))

    expectNothingStarted(ctx)
  })

  it.each([
    {name: 'no reference', assembly: undefined},
    {name: 'a reference without a conversation', assembly: REF},
  ])('refuses to build the embed of a poll with $name', async ({assembly}) => {
    const ctx = setup()

    await expect(
      resolveEmbed(
        ctx.agent,
        queryClient,
        draft({poll: {statements: STATEMENTS, assembly}}) as never,
        undefined,
      ),
    ).rejects.toThrow(
      new Error('A poll cannot be posted before its assembly exists'),
    )

    expect(mockImageToThumb).not.toHaveBeenCalled()
  })
})
