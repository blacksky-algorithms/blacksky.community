import {type ComposerImage} from '#/state/gallery'
import {
  type ComposerAction,
  composerReducer,
  createComposerState,
} from '../composer'

jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('../video', () => ({
  createVideoState: jest.fn(),
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

function draftAfter(actions: PostAction[]) {
  let state = createComposerState({
    initText: undefined,
    initMention: undefined,
    initImageUris: undefined,
    initQuoteUri: undefined,
    initInteractionSettings: undefined,
  })
  for (const postAction of actions) {
    state = composerReducer(state, {
      type: 'update_post',
      postId: state.thread.posts[0].id,
      postAction,
    })
  }
  return state.thread.posts[0]
}

describe('composer self labels', () => {
  it('keeps labels when the last image is removed', () => {
    const post = draftAfter([
      {type: 'embed_add_images', images: [image]},
      {type: 'update_labels', labels: ['porn']},
      {type: 'embed_remove_image', image},
    ])

    expect(post.embed.media).toBeUndefined()
    expect(post.labels).toEqual(['porn'])
  })

  it('keeps labels when the link card is removed', () => {
    const post = draftAfter([
      {type: 'embed_add_uri', uri: 'https://example.com'},
      {type: 'update_labels', labels: ['graphic-media']},
      {type: 'embed_remove_link'},
    ])

    expect(post.embed.link).toBeUndefined()
    expect(post.labels).toEqual(['graphic-media'])
  })

  it('keeps labels when a video is removed from a text-only draft', () => {
    const post = draftAfter([
      {type: 'update_labels', labels: ['sexual']},
      {type: 'embed_remove_video'},
    ])

    expect(post.labels).toEqual(['sexual'])
  })
})
