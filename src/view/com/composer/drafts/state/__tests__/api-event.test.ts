
import {RichText} from '@bsky/sdk/richtext'
import {type app} from '#/lexicons'
import {
  type ComposerState,
  type PostDraft,
} from '#/view/com/composer/state/composer'
import {type EventDraft} from '#/features/events/draft'
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

const EVENT_KEY = 'communityBlackskyEvent'

const event: EventDraft = {
  step: 'when',
  name: 'Party',
  description: 'Bring snacks',
  location: 'Prospect Park',
  startsAt: '2027-01-15T00:00:00.000Z',
  endsAt: '2027-01-15T03:00:00.000Z',
}

function savedEvent(draft: app.bsky.draft.defs.Draft, index = 0): unknown {
  return (draft.posts[index] as unknown as Record<string, unknown>)[EVENT_KEY]
}

function asStored(draft: app.bsky.draft.defs.Draft): app.bsky.draft.defs.Draft {
  return JSON.parse(JSON.stringify(draft)) as app.bsky.draft.defs.Draft
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

function draftPost(extra: Record<string, unknown>): app.bsky.draft.defs.DraftPost {
  return {
    $type: 'app.bsky.draft.defs#draftPost',
    text: 'hello',
    ...extra,
  }
}

function draftOf(posts: app.bsky.draft.defs.DraftPost[]): app.bsky.draft.defs.Draft {
  return {$type: 'app.bsky.draft.defs#draft', posts}
}

describe('draft events', () => {
  it('saves the event as an extra property on the draft post', async () => {
    const {draft} = await composerStateToDraft(state([post({event})]))
    expect(savedEvent(draft)).toStrictEqual(event)
  })

  it('omits the property when there is no event', async () => {
    const {draft} = await composerStateToDraft(state([post({}, 'text')]))
    expect(EVENT_KEY in draft.posts[0]).toBe(false)
  })

  it("keeps a link's image but drops a picked photo, which lives only on this device", async () => {
    const withLink = await composerStateToDraft(
      state([post({event: {...event, cover: {url: 'https://x.test/og.jpg'}}})]),
    )
    expect(savedEvent(withLink.draft)).toMatchObject({
      cover: {url: 'https://x.test/og.jpg'},
    })

    const withPhoto = await composerStateToDraft(
      state([
        post({
          event: {
            ...event,
            cover: {
              path: 'file:///a.jpg',
              mime: 'image/jpeg',
              width: 3,
              height: 1,
            },
          },
        }),
      ]),
    )
    expect(savedEvent(withPhoto.draft)).not.toHaveProperty('cover')
  })

  it('round-trips an event through save and restore', async () => {
    const {draft} = await composerStateToDraft(
      state([post({event: {...event, coverRemoved: true}}, 'come')]),
    )
    const {posts} = await draftToComposerPosts(asStored(draft), new Map())
    expect(posts[0].embed.event).toEqual({...event, coverRemoved: true})
    expect(posts[0].richtext.text).toBe('come')
  })

  it.each([
    {kind: 'a missing name', value: {...event, name: undefined}},
    {kind: 'an unknown step', value: {...event, step: 'launch'}},
    {kind: 'an unreadable date', value: {...event, startsAt: 'soon'}},
    {kind: 'a non-object', value: 'party'},
  ])('ignores a saved event with $kind', async ({value}) => {
    const {posts} = await draftToComposerPosts(
      draftOf([draftPost({[EVENT_KEY]: value})]),
      new Map(),
    )
    expect(posts[0].embed.event).toBeUndefined()
  })

  it('does not restore an event beside a quote', async () => {
    const {posts} = await draftToComposerPosts(
      draftOf([
        draftPost({
          [EVENT_KEY]: event,
          embedRecords: [
            {
              $type: 'app.bsky.draft.defs#draftEmbedRecord',
              record: {
                uri: 'at://did:plc:a/app.bsky.feed.post/1',
                cid: 'bafyreiquote',
              },
            },
          ],
        }),
      ]),
      new Map(),
    )
    expect(posts[0].embed.quote).toBeDefined()
    expect(posts[0].embed.event).toBeUndefined()
  })

  it('shows the event in the draft list', () => {
    const summary = draftViewToSummary({
      view: {
        id: 'd1',
        draft: draftOf([draftPost({[EVENT_KEY]: event})]),
        createdAt: '2027-01-01T00:00:00.000Z',
        updatedAt: '2027-01-01T00:00:00.000Z',
      },
      analytics: {logger: {warn: jest.fn()}} as never,
    })
    expect(summary.posts[0].event).toEqual(event)
  })
})
