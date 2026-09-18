jest.mock('#/lib/api/community-feed', () => ({
  isSpaceBackedFeed: (config: {space?: string} | undefined) => !!config?.space,
}))
jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/lib/strings/url-helpers', () => ({
  isBskyPostUrl: jest.fn(),
  postUriToRelativePath: jest.fn(),
}))
jest.mock('#/state/queries/postgate/util', () => ({
  createPostgateRecord: jest.fn(() => ({})),
}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('#/state/shell/composer', () => ({}))
jest.mock('#/view/com/composer/text-input/text-input-util', () => ({
  shortenLinks: jest.fn(value => value),
}))

import {composerReducer, type ComposerState} from '../composer'

const privateTarget = {
  feed: 'at://did:plc:test/app.bsky.feed.generator/private',
  name: 'Private',
  serviceDid: 'did:web:feeds.test',
  config: {
    $type: 'community.blacksky.feed.config' as const,
    contentType: 'communityRecord' as const,
    visibility: 'gated' as const,
    space: 'at://did:plc:test/space/community.blacksky.feed/private',
    group: 'members',
    createdAt: '2026-08-30T00:00:00.000Z',
  },
}

function stateWithVideo(): ComposerState {
  const abortController = new AbortController()
  return {
    activePostIndex: 0,
    mutableNeedsFocusActive: false,
    isDirty: false,
    thread: {
      posts: [
        {
          id: 'post',
          richtext: {} as never,
          shortenedGraphemeLength: 0,
          labels: [],
          embed: {
            quote: undefined,
            link: undefined,
            media: {
              type: 'video',
              video: {
                status: 'uploading',
                progress: 0,
                abortController,
                asset: {} as never,
                video: {} as never,
                altText: '',
                captions: [],
              },
            },
          },
        },
      ],
      postgate: {} as never,
      threadgate: [],
      blackskyOnly: false,
    },
  }
}

describe('composer target changes', () => {
  it('clears and aborts a pending video when entering a space-backed feed', () => {
    const state = stateWithVideo()
    const next = composerReducer(state, {
      type: 'set_post_target',
      target: privateTarget,
    })

    expect(next.thread.posts[0].embed.media).toBeUndefined()
    expect(
      (
        state.thread.posts[0].embed.media as {
          video: {abortController: AbortController}
        }
      ).video.abortController.signal.aborted,
    ).toBe(true)
  })
})
