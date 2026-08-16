import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {resolveEmbed} from '../index'
import {postToSpace} from '../space-post'
import {spaceCreateRecord} from '../space-write'

jest.mock('../index', () => ({
  quotedSpace: jest.fn((uri?: string) =>
    uri?.includes('/space/') ? uri.split('/did:plc:author/')[0] : null,
  ),
  resolveEmbed: jest.fn(),
  resolveReply: jest.fn(),
  resolveRT: jest.fn(async (_agent, richtext) => richtext),
}))

jest.mock('../space-write', () => ({
  POST_COLLECTION: 'app.bsky.feed.post',
  spaceCreateRecord: jest.fn(async () => ({
    uri: 'at://space/post',
    cid: 'bafyspace',
  })),
}))

const SPACE = 'at://did:plc:space/space/community.blacksky.feed/private'
const OTHER = 'at://did:plc:other/space/community.blacksky.feed/private'
const agent = {} as AtpAgent
const queryClient = {} as QueryClient

const thread = (embed: object = {}) =>
  ({
    posts: [
      {
        id: 'draft-operation-1',
        richtext: {text: 'hello', facets: []},
        shortenedGraphemeLength: 5,
        labels: [],
        embed,
      },
    ],
    postgate: {},
    threadgate: [],
    blackskyOnly: false,
    communitySpaceUri: SPACE,
  }) as never

describe(postToSpace, () => {
  beforeEach(() => jest.clearAllMocks())

  it.each(['images', 'gallery', 'video', 'gif'])(
    'blocks %s before embed resolution or a write',
    async type => {
      await expect(
        postToSpace(agent, queryClient, SPACE, {
          thread: thread({media: {type}}),
        }),
      ).rejects.toThrow(/not available in private spaces/i)

      expect(resolveEmbed).not.toHaveBeenCalled()
      expect(spaceCreateRecord).not.toHaveBeenCalled()
    },
  )

  it('refuses a quote from another space before embed resolution', async () => {
    await expect(
      postToSpace(agent, queryClient, SPACE, {
        thread: thread({
          quote: {
            uri: `${OTHER}/did:plc:author/app.bsky.feed.post/3kquote`,
          },
        }),
      }),
    ).rejects.toThrow(/another space/i)

    expect(resolveEmbed).not.toHaveBeenCalled()
    expect(spaceCreateRecord).not.toHaveBeenCalled()
  })
})
