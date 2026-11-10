import {type Client} from '@atproto/lex'
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
  resolveRT: jest.fn((_agent, richtext) => Promise.resolve(richtext)),
}))

jest.mock('../space-write', () => ({
  POST_COLLECTION: 'app.bsky.feed.post',
  spaceCreateRecord: jest.fn(() =>
    Promise.resolve({
      uri: 'at://space/post',
      cid: 'bafyspace',
    }),
  ),
}))

const SPACE = 'at://did:plc:space/space/community.blacksky.feed/private'
const OTHER = 'at://did:plc:other/space/community.blacksky.feed/private'
const client = {} as Client
const clients = {
  appviewClient: client,
  chatClient: client,
  pdsClient: client,
}
const queryClient = {} as QueryClient

const thread = (embed: object = {}, id = 'draft-operation-1') =>
  ({
    posts: [
      {
        id,
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

  it('refuses a quote from another space before embed resolution', async () => {
    await expect(
      postToSpace(queryClient, SPACE, {
        ...clients,
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

  it('uses the stable protocol-valid draft id as the record key', async () => {
    await postToSpace(queryClient, SPACE, {...clients, thread: thread()})

    expect(spaceCreateRecord).toHaveBeenCalledWith(
      client,
      SPACE,
      'app.bsky.feed.post',
      expect.objectContaining({text: 'hello'}),
      'draft-operation-1',
    )
  })

  it('derives a stable record key from a saved draft id and post index', async () => {
    const opts = {...clients, thread: thread(), draftId: '3mabcde234567'}

    await postToSpace(queryClient, SPACE, opts)
    await postToSpace(queryClient, SPACE, opts)

    expect(spaceCreateRecord).toHaveBeenNthCalledWith(
      1,
      client,
      SPACE,
      'app.bsky.feed.post',
      expect.any(Object),
      '3mabcde234567-0',
    )
    expect(spaceCreateRecord).toHaveBeenNthCalledWith(
      2,
      client,
      SPACE,
      'app.bsky.feed.post',
      expect.any(Object),
      '3mabcde234567-0',
    )
  })

  it('rejects an invalid draft id before writing', async () => {
    await expect(
      postToSpace(queryClient, SPACE, {
        ...clients,
        thread: thread({}, 'bad/id'),
      }),
    ).rejects.toThrow(/record key/i)

    expect(spaceCreateRecord).not.toHaveBeenCalled()
  })
})
