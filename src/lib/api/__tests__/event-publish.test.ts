import {type AtpAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import {type EventDraft} from '#/features/events/draft'
import {post} from '../index'
import {postToSpace} from '../space-post'

jest.mock('expo-localization', () => ({
  getLocales: () => [{languageTag: 'en-US', regionCode: 'US'}],
}))
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
jest.mock('../space-post', () => ({postToSpace: jest.fn()}))

const queryClient = {invalidateQueries: jest.fn()} as unknown as QueryClient
const SPACE = 'at://did:plc:community/space/community.blacksky.feed/private'

const event: EventDraft = {
  step: 'done',
  name: 'Live Turntable Party',
  description: 'Theme: songs by Aquarians',
  location: 'Prospect Park',
  startsAt: '2027-01-15T00:00:00.000Z',
  endsAt: '2027-01-15T03:00:00.000Z',
}

type Write = {
  collection: string
  rkey: string
  value: Record<string, unknown> & {
    embed?: {$type: string; external: Record<string, string>}
  }
}

function setup() {
  const applyWrites = jest.fn((_input: {writes: Write[]; validate?: boolean}) =>
    Promise.resolve({}),
  )
  const agent = {
    assertDid: 'did:plc:alice',
    com: {atproto: {repo: {applyWrites}}},
  } as unknown as AtpAgent
  return {agent, applyWrites}
}

function thread(embed: Record<string, unknown>, extra = {}) {
  return {
    posts: [
      {
        id: 'post-1',
        richtext: {text: 'Come through', facets: []},
        shortenedGraphemeLength: 12,
        labels: [],
        embed,
      },
    ],
    postgate: {},
    threadgate: [],
    blackskyOnly: false,
    ...extra,
  } as never
}

describe('publishing a post with an event', () => {
  it('writes the event and the post together, linking the post to it', async () => {
    const {agent, applyWrites} = setup()

    const result = await post(agent, queryClient, {thread: thread({event})})

    expect(applyWrites).toHaveBeenCalledTimes(1)
    const [{writes, validate}] = applyWrites.mock.calls[0]
    expect(validate).toBeUndefined()
    expect(writes.map(w => w.collection)).toEqual([
      'community.lexicon.calendar.event',
      'app.bsky.feed.post',
    ])
    const [eventWrite, postWrite] = writes
    expect(eventWrite.value).toMatchObject({
      $type: 'community.lexicon.calendar.event',
      name: 'Live Turntable Party',
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      mode: 'community.lexicon.calendar.event#inperson',
      locations: [
        {
          $type: 'community.lexicon.location.address',
          name: 'Prospect Park',
          country: 'US',
        },
      ],
    })
    expect(postWrite.value.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: expect.objectContaining({
        uri: `https://blacksky.community/event/did:plc:alice/${eventWrite.rkey}`,
        title: 'Live Turntable Party',
      }),
    })
    expect(result.event).toEqual({
      uri: `at://did:plc:alice/community.lexicon.calendar.event/${eventWrite.rkey}`,
    })
  })

  it('still asks the PDS to validate posts without an event', async () => {
    const {agent, applyWrites} = setup()

    const result = await post(agent, queryClient, {thread: thread({})})

    expect(applyWrites.mock.calls[0][0].validate).toBe(true)
    expect(result).not.toHaveProperty('event')
  })

  it('refuses an event on a Blacksky-only post', async () => {
    const {agent, applyWrites} = setup()

    await expect(
      post(agent, queryClient, {
        thread: thread({event}, {blackskyOnly: true}),
      }),
    ).rejects.toThrow('Events are only available on public posts.')
    expect(applyWrites).not.toHaveBeenCalled()
  })

  it('refuses an event in a private space', async () => {
    const {agent} = setup()

    await expect(
      post(agent, queryClient, {
        thread: thread({event}, {communitySpaceUri: SPACE}),
      }),
    ).rejects.toThrow('Events are only available on public posts.')
    expect(jest.mocked(postToSpace)).not.toHaveBeenCalled()
  })
})
