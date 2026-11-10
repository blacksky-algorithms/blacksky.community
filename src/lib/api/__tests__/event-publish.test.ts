import {type Client} from '@atproto/lex'
import {type QueryClient} from '@tanstack/react-query'

import {logger} from '#/logger'
import {type EventDraft} from '#/features/events/draft'
import {post} from '../index'
import {imageToThumb} from '../resolve'
import {postToSpace} from '../space-post'
import {uploadBlob} from '../upload-blob'

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
jest.mock('../resolve', () => ({imageToThumb: jest.fn()}))
jest.mock('../upload-blob', () => ({uploadBlob: jest.fn()}))

const COVER_BLOB = {
  $type: 'blob',
  ref: {$link: 'bafkreicover'},
  mimeType: 'image/jpeg',
  size: 1234,
}

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
  const client = {
    assertDid: 'did:plc:alice',
    com: {atproto: {repo: {applyWrites}}},
  } as unknown as AtpAgent
  return {client, applyWrites}
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
    const {client, applyWrites} = setup()

    const result = await post(client, queryClient, {thread: thread({event})})

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
    const {client, applyWrites} = setup()

    const result = await post(client, queryClient, {thread: thread({})})

    expect(applyWrites.mock.calls[0][0].validate).toBe(true)
    expect(result).not.toHaveProperty('event')
  })

  it('refuses an event on a Blacksky-only post', async () => {
    const {client, applyWrites} = setup()

    await expect(
      post(client, queryClient, {
        thread: thread({event}, {blackskyOnly: true}),
      }),
    ).rejects.toThrow('Events are only available on public posts.')
    expect(applyWrites).not.toHaveBeenCalled()
  })

  it('refuses an event in a private space', async () => {
    const {client} = setup()

    await expect(
      post(client, queryClient, {
        thread: thread({event}, {communitySpaceUri: SPACE}),
      }),
    ).rejects.toThrow('Events are only available on public posts.')
    expect(jest.mocked(postToSpace)).not.toHaveBeenCalled()
  })

  describe('with a cover image', () => {
    let warn: jest.SpyInstance
    beforeEach(() => {
      jest.mocked(uploadBlob).mockReset()
      jest.mocked(imageToThumb).mockReset()
      jest
        .mocked(uploadBlob)
        .mockResolvedValue({data: {blob: COVER_BLOB}} as never)
      warn = jest.spyOn(logger, 'warn').mockImplementation(() => {})
    })
    afterEach(() => warn.mockRestore())

    async function publish(cover: EventDraft['cover']) {
      const {client, applyWrites} = setup()
      await post(client, queryClient, {
        thread: thread({event: {...event, cover}}),
      })
      const [eventWrite, postWrite] = applyWrites.mock.calls[0][0].writes
      return {eventWrite, postWrite}
    }

    it('uploads a picked photo once and uses it for the event and the link card', async () => {
      const {eventWrite, postWrite} = await publish({
        path: 'file:///cover.jpg',
        mime: 'image/jpeg',
        width: 1500,
        height: 500,
      })

      expect(uploadBlob).toHaveBeenCalledTimes(1)
      expect(uploadBlob).toHaveBeenCalledWith(
        expect.anything(),
        'file:///cover.jpg',
        'image/jpeg',
      )
      expect(eventWrite.value.media).toEqual([
        {
          role: 'thumbnail',
          content: COVER_BLOB,
          aspect_ratio: {width: 1500, height: 500},
        },
      ])
      expect(postWrite.value.embed?.external.thumb).toBe(COVER_BLOB)
    })

    it("downloads a link's image before uploading it", async () => {
      jest.mocked(imageToThumb).mockResolvedValue({
        source: {
          id: 'x',
          path: 'file:///link.jpg',
          mime: 'image/jpeg',
          width: 1200,
          height: 630,
        },
      } as never)

      const {eventWrite} = await publish({url: 'https://example.com/og.jpg'})

      expect(imageToThumb).toHaveBeenCalledWith('https://example.com/og.jpg')
      expect(uploadBlob).toHaveBeenCalledWith(
        expect.anything(),
        'file:///link.jpg',
        'image/jpeg',
      )
      expect(eventWrite.value.media).toEqual([
        expect.objectContaining({aspect_ratio: {width: 1200, height: 630}}),
      ])
    })

    it('stops the post with an error when the upload fails', async () => {
      jest.mocked(uploadBlob).mockRejectedValue(new Error('offline'))
      const {client, applyWrites} = setup()

      await expect(
        post(client, queryClient, {
          thread: thread({
            event: {
              ...event,
              cover: {
                path: 'file:///cover.jpg',
                mime: 'image/jpeg',
                width: 1500,
                height: 500,
              },
            },
          }),
        }),
      ).rejects.toThrow("Couldn't upload the event image.")
      expect(applyWrites).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith('Failed to upload the event image', {
        safeMessage: 'offline',
      })
    })

    it('stops the post when a link image cannot be read', async () => {
      jest.mocked(imageToThumb).mockResolvedValue(undefined)
      const {client, applyWrites} = setup()

      await expect(
        post(client, queryClient, {
          thread: thread({
            event: {...event, cover: {url: 'https://x.test/a.jpg'}},
          }),
        }),
      ).rejects.toThrow("Couldn't upload the event image.")
      expect(applyWrites).not.toHaveBeenCalled()
    })
  })
})
