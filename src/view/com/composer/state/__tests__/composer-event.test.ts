import {type ComposerImage} from '#/state/gallery'
import {type Gif} from '#/features/gifPicker/types'
import {
  type ComposerAction,
  composerReducer,
  type ComposerState,
  createComposerState,
  isEventPostable,
  postHasAttachment,
  threadHasEvent,
} from '../composer'

jest.mock('#/lib/api/community-feed', () => ({
  isSpaceBackedFeed: (config: {space?: string} | undefined) => !!config?.space,
}))
jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('../video', () => ({
  createVideoState: jest.fn(() => ({abortController: new AbortController()})),
  videoReducer: jest.fn(),
}))

const image = {
  source: {
    id: 'img-1',
    path: 'file://a',
    mime: 'image/jpeg',
    width: 1,
    height: 1,
  },
} as unknown as ComposerImage

type PostAction = Extract<ComposerAction, {type: 'update_post'}>['postAction']

function initialState(): ComposerState {
  return createComposerState({
    initText: undefined,
    initMention: undefined,
    initImageUris: undefined,
    initQuoteUri: undefined,
    initInteractionSettings: undefined,
  })
}

function updatePost(
  state: ComposerState,
  index: number,
  postAction: PostAction,
): ComposerState {
  return composerReducer(state, {
    type: 'update_post',
    postId: state.thread.posts[index].id,
    postAction,
  })
}

function apply(state: ComposerState, actions: PostAction[]): ComposerState {
  return actions.reduce((next, action) => updatePost(next, 0, action), state)
}

function draftAfter(actions: PostAction[]) {
  return apply(initialState(), actions).thread.posts[0]
}

const named: PostAction = {type: 'embed_update_event', fields: {name: 'Party'}}

describe('composer events', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-15T11:05:42.123Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('adds an event at the first step, starting and ending now', () => {
    const post = draftAfter([{type: 'embed_add_event'}])
    expect(post.embed.event).toEqual({
      step: 'details',
      name: '',
      description: '',
      location: '',
      startsAt: '2027-01-15T11:05:00.000Z',
      endsAt: '2027-01-15T11:05:00.000Z',
    })
    expect(postHasAttachment(post)).toBe(true)
  })

  it('updates fields and steps, and removes the event', () => {
    let state = apply(initialState(), [
      {type: 'embed_add_event'},
      named,
      {type: 'embed_update_event', fields: {location: 'The park'}},
      {type: 'embed_set_event_step', step: 'when'},
    ])
    expect(state.thread.posts[0].embed.event).toMatchObject({
      step: 'when',
      name: 'Party',
      location: 'The park',
    })
    state = apply(state, [{type: 'embed_remove_event'}])
    expect(state.thread.posts[0].embed.event).toBeUndefined()
  })

  it('ignores updates when there is no event', () => {
    const post = draftAfter([
      named,
      {type: 'embed_set_event_step', step: 'done'},
    ])
    expect(post.embed.event).toBeUndefined()
  })

  it('is not added next to another attachment', () => {
    const post = draftAfter([
      {type: 'embed_add_images', images: [image]},
      {type: 'embed_add_event'},
    ])
    expect(post.embed.event).toBeUndefined()
  })

  it('is not added next to a poll', () => {
    const post = draftAfter([
      {type: 'embed_add_poll'},
      {type: 'embed_add_event'},
    ])
    expect(post.embed.event).toBeUndefined()
  })

  it('keeps other attachments out once added', () => {
    const post = draftAfter([
      {type: 'embed_add_event'},
      {type: 'embed_add_images', images: [image]},
      {type: 'embed_add_uri', uri: 'https://example.com'},
      {type: 'embed_add_gif', gif: {} as Gif},
      {type: 'embed_add_poll'},
    ])
    expect(post.embed.media).toBeUndefined()
    expect(post.embed.link).toBeUndefined()
    expect(post.embed.poll).toBeUndefined()
    expect(post.embed.event).toBeDefined()
  })

  it('allows one event per thread', () => {
    let state = composerReducer(initialState(), {type: 'add_post'})
    state = updatePost(state, 0, {type: 'embed_add_event'})
    state = updatePost(state, 1, {type: 'embed_add_event'})
    expect(state.thread.posts[0].embed.event).toBeDefined()
    expect(state.thread.posts[1].embed.event).toBeUndefined()
    expect(threadHasEvent(state.thread)).toBe(true)
  })

  it('is not added to a Blacksky-only post', () => {
    let state = composerReducer(initialState(), {type: 'toggle_blacksky_only'})
    state = updatePost(state, 0, {type: 'embed_add_event'})
    expect(state.thread.posts[0].embed.event).toBeUndefined()
  })

  it('is not added to a thread quoting a community post', () => {
    let state = updatePost(initialState(), 0, {
      type: 'embed_add_uri',
      uri: 'https://bsky.app/profile/did:plc:author/post/3kabc?collection=community.blacksky.feed.post',
    })
    state = composerReducer(state, {type: 'add_post'})
    state = updatePost(state, 1, {type: 'embed_add_event'})
    expect(state.thread.posts[1].embed.event).toBeUndefined()
  })

  it('is cleared when the post moves off the public target', () => {
    let state = updatePost(initialState(), 0, {type: 'embed_add_event'})
    state = composerReducer(state, {
      type: 'set_post_target',
      target: 'blacksky',
    })
    expect(state.thread.posts[0].embed.event).toBeUndefined()
  })

  it('keeps only the first event when restoring a draft', () => {
    const two = composerReducer(initialState(), {type: 'add_post'})
    const draft = apply(initialState(), [{type: 'embed_add_event'}]).thread
      .posts[0].embed.event!
    const posts = two.thread.posts.map(p => ({
      ...p,
      embed: {...p.embed, event: draft},
    }))
    const restored = composerReducer(initialState(), {
      type: 'restore_from_draft',
      draftId: 'd1',
      posts,
      threadgateAllow: undefined,
      postgateEmbeddingRules: undefined,
      loadedMedia: new Map(),
      originalLocalRefs: new Set(),
    })
    expect(restored.thread.posts.map(p => !!p.embed.event)).toEqual([
      true,
      false,
    ])
  })

  describe('isEventPostable', () => {
    it('is true without an event', () => {
      expect(isEventPostable(draftAfter([]))).toBe(true)
    })

    it('needs the steps finished', () => {
      expect(
        isEventPostable(draftAfter([{type: 'embed_add_event'}, named])),
      ).toBe(false)
      expect(
        isEventPostable(
          draftAfter([
            {type: 'embed_add_event'},
            named,
            {type: 'embed_set_event_step', step: 'done'},
          ]),
        ),
      ).toBe(true)
    })

    it('needs a name', () => {
      expect(
        isEventPostable(
          draftAfter([
            {type: 'embed_add_event'},
            {type: 'embed_update_event', fields: {name: '   '}},
            {type: 'embed_set_event_step', step: 'done'},
          ]),
        ),
      ).toBe(false)
    })

    it('refuses an end before the start', () => {
      expect(
        isEventPostable(
          draftAfter([
            {type: 'embed_add_event'},
            named,
            {
              type: 'embed_update_event',
              fields: {endsAt: '2027-01-15T10:00:00.000Z'},
            },
            {type: 'embed_set_event_step', step: 'done'},
          ]),
        ),
      ).toBe(false)
    })
  })
})
