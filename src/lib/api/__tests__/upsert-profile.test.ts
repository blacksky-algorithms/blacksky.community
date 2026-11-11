// The repo-wide stub of this module rejects every CID the client validates.
jest.unmock('multiformats/cid')

import {createLexClient} from '#/lib/lexClient'
import {getErrorStatus} from '#/lib/xrpc-error'
import {upsertProfile} from '../upsert-profile'

const DID = 'did:plc:me'
const CID = 'bafyreiacsg6vsw7ppwbnowzsdgstulhrwftirtcnvkcbnfgvhwjrnzfmsu'
const BLOB = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
const LEGACY_AVATAR = {cid: BLOB, mimeType: 'image/jpeg'}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  })
}

function stored(value: Record<string, unknown>) {
  return json({
    uri: `at://${DID}/app.bsky.actor.profile/self`,
    cid: CID,
    value: {$type: 'app.bsky.actor.profile', ...value},
  })
}

const written = () =>
  json({uri: `at://${DID}/app.bsky.actor.profile/self`, cid: CID})

function mockClient() {
  const fetchHandler = jest.fn<Promise<Response>, [string, RequestInit]>()
  const client = createLexClient({did: DID, fetchHandler})
  const puts = () =>
    fetchHandler.mock.calls
      .filter(([path]) => path.includes('com.atproto.repo.putRecord'))
      .map(
        ([, init]) =>
          JSON.parse(init.body as string) as {
            record: Record<string, unknown>
            swapRecord?: string
          },
      )
  return {client, fetchHandler, puts}
}

describe('upsertProfile', () => {
  it('keeps a legacy blob reference and every untouched field', async () => {
    const {client, fetchHandler, puts} = mockClient()
    fetchHandler
      .mockResolvedValueOnce(
        stored({displayName: 'Old', description: 'bio', avatar: LEGACY_AVATAR}),
      )
      .mockResolvedValueOnce(written())

    await client.call(upsertProfile, existing => ({
      ...existing,
      displayName: 'New',
    }))

    expect(puts()).toEqual([
      {
        repo: DID,
        collection: 'app.bsky.actor.profile',
        rkey: 'self',
        swapRecord: CID,
        record: {
          $type: 'app.bsky.actor.profile',
          displayName: 'New',
          description: 'bio',
          avatar: LEGACY_AVATAR,
        },
      },
    ])
  })

  it('creates the profile when there is none', async () => {
    const {client, fetchHandler, puts} = mockClient()
    fetchHandler
      .mockResolvedValueOnce(
        json({error: 'RecordNotFound', message: 'no record'}, 400),
      )
      .mockResolvedValueOnce(written())
    const update = jest.fn(() => ({displayName: 'New'}))

    await client.call(upsertProfile, update)

    expect(update).toHaveBeenCalledWith(undefined)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].record).toEqual({
      $type: 'app.bsky.actor.profile',
      displayName: 'New',
    })
    expect(puts()[0].swapRecord).toBeUndefined()
  })

  it('writes nothing when the profile cannot be read', async () => {
    const {client, fetchHandler, puts} = mockClient()
    fetchHandler.mockResolvedValue(
      json({error: 'InternalServerError', message: 'down'}, 500),
    )
    const update = jest.fn(() => ({displayName: 'New'}))

    const failure: unknown = await client
      .call(upsertProfile, update)
      .catch((e: unknown) => e)

    expect(getErrorStatus(failure)).toBe(500)
    expect(update).not.toHaveBeenCalled()
    expect(puts()).toHaveLength(0)
  })

  it('reads again and retries after a concurrent write', async () => {
    const {client, fetchHandler, puts} = mockClient()
    fetchHandler
      .mockResolvedValueOnce(stored({displayName: 'Old'}))
      .mockResolvedValueOnce(
        json({error: 'InvalidSwap', message: 'record changed'}, 400),
      )
      .mockResolvedValueOnce(
        stored({displayName: 'Old', description: 'new bio'}),
      )
      .mockResolvedValueOnce(written())

    await client.call(upsertProfile, existing => ({
      ...existing,
      displayName: 'New',
    }))

    expect(puts()).toHaveLength(2)
    expect(puts()[1].record).toEqual({
      $type: 'app.bsky.actor.profile',
      displayName: 'New',
      description: 'new bio',
    })
  })
})
