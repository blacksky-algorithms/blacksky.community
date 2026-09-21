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
  it.each([false, true])(
    'toggles Blacksky Only from %s and preserves a pending video',
    blackskyOnly => {
      const state = stateWithVideo()
      state.thread.blackskyOnly = blackskyOnly
      const media = state.thread.posts[0].embed.media
      const next = composerReducer(state, {type: 'toggle_blacksky_only'})

      expect(next.thread.blackskyOnly).toBe(!blackskyOnly)
      expect(next.isDirty).toBe(true)
      expect(next.thread.posts).toBe(state.thread.posts)
      expect(
        media?.type === 'video' && media.video.abortController.signal.aborted,
      ).toBe(false)
      expect(state.thread.blackskyOnly).toBe(blackskyOnly)
      expect(state.isDirty).toBe(false)
    },
  )

  it.each(['public', 'blacksky'] as const)(
    'applies the explicit %s target without a video target transition',
    target => {
      const state = stateWithVideo()
      state.thread.blackskyOnly = target === 'public'
      const next = composerReducer(state, {type: 'set_post_target', target})

      expect(next.thread.blackskyOnly).toBe(target === 'blacksky')
      expect(next.isDirty).toBe(true)
      expect(next.thread.posts).toBe(state.thread.posts)
    },
  )

  it('updates the selected private feed when both targets are space-backed', () => {
    const state = stateWithVideo()
    state.thread.communityFeed = privateTarget
    state.thread.communityFeedUri = privateTarget.feed
    const target = {...privateTarget, feed: `${privateTarget.feed}-other`}
    const next = composerReducer(state, {type: 'set_post_target', target})

    expect(next.thread.communityFeed).toBe(target)
    expect(next.thread.communityFeedUri).toBe(target.feed)
    expect(next.isDirty).toBe(true)
    expect(next.thread.posts).toBe(state.thread.posts)
  })

  it('clears and aborts a pending video when leaving a space-backed feed', () => {
    const state = stateWithVideo()
    state.thread.communityFeed = privateTarget
    state.thread.communityFeedUri = privateTarget.feed
    const media = state.thread.posts[0].embed.media
    const next = composerReducer(state, {
      type: 'set_post_target',
      target: 'public',
    })

    expect(next.thread.communityFeed).toBeUndefined()
    expect(next.thread.communityFeedUri).toBeUndefined()
    expect(next.thread.blackskyOnly).toBe(false)
    expect(next.isDirty).toBe(true)
    expect(next.thread.posts[0].embed.media).toBeUndefined()
    expect(
      media?.type === 'video' && media.video.abortController.signal.aborted,
    ).toBe(true)
  })

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
