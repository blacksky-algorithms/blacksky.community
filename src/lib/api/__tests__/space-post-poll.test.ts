import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {resolveEmbed, resolveRT} from '../index'
import {postToSpace} from '../space-post'
import {spaceCreateRecord} from '../space-write'

jest.mock('../index', () => ({
  quotedSpace: jest.fn(() => null),
  resolveEmbed: jest.fn(),
  resolveReply: jest.fn(),
  resolveRT: jest.fn(),
}))
jest.mock('../space-write', () => ({
  POST_COLLECTION: 'app.bsky.feed.post',
  spaceCreateRecord: jest.fn(),
}))

const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'

const draft = (embed: Record<string, unknown>) => ({
  richtext: {text: 'hi', facets: []},
  shortenedGraphemeLength: 2,
  labels: [],
  embed,
})

describe('posting a thread into a space', () => {
  it('refuses the whole thread before the first write when any post has a poll', async () => {
    await expect(
      postToSpace({} as AtpAgent, {} as QueryClient, SPACE, {
        thread: {
          posts: [draft({}), draft({poll: {statements: ['A']}})],
          postgate: {},
          threadgate: [],
          blackskyOnly: false,
        } as never,
      }),
    ).rejects.toThrow(/Discussions are not available/)

    expect(resolveRT).not.toHaveBeenCalled()
    expect(resolveEmbed).not.toHaveBeenCalled()
    expect(spaceCreateRecord).not.toHaveBeenCalled()
  })
})
