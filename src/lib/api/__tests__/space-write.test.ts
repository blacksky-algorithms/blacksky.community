import {type BskyAgent} from '@atproto/api'
import {describe, expect, it} from '@jest/globals'

import {
  LIKE_COLLECTION,
  POST_COLLECTION,
  spaceCreateRecord,
  spaceDeleteRecord,
  spaceLike,
  spaceUnlike,
  SpaceUnsupportedError,
} from '#/lib/api/space-write'

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const SUBJECT = {
  uri: `${SPACE}/did:plc:alice/app.bsky.feed.post/3kabc`,
  cid: 'bafyreisubject',
}

type Call = {path: string; headers: Record<string, string>; body: string}

function agentWith(response: {status?: number; body?: unknown} = {}) {
  const calls: Call[] = []
  const status = response.status ?? 200
  const agent = {
    fetchHandler(path: string, init: RequestInit) {
      calls.push({
        path,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: typeof init.body === 'string' ? init.body : '',
      })
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () =>
          Promise.resolve(
            response.body ?? {uri: 'at://space/record', cid: 'bafyreinew'},
          ),
      } as unknown as Response)
    },
  } as unknown as BskyAgent
  return {agent, calls}
}

const bodyOf = (call: Call): Record<string, unknown> =>
  JSON.parse(call.body) as Record<string, unknown>

describe('space writes', () => {
  it('posts to the account’s own pds without a proxy header', async () => {
    const {agent, calls} = agentWith()
    await spaceCreateRecord(agent, SPACE, POST_COLLECTION, {
      $type: POST_COLLECTION,
      text: 'hello',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/xrpc/com.atproto.space.createRecord')
    // The write belongs to the PDS, not the appview. Proxying it would send
    // private content to the wrong service entirely.
    expect(calls[0].headers['atproto-proxy']).toBeUndefined()
    expect(bodyOf(calls[0])).toEqual({
      space: SPACE,
      collection: POST_COLLECTION,
      record: {$type: POST_COLLECTION, text: 'hello'},
    })
  })

  it('passes an explicit rkey through and omits it otherwise', async () => {
    const {agent, calls} = agentWith()
    await spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}, '3kxyz')
    expect(bodyOf(calls[0]).rkey).toBe('3kxyz')

    await spaceCreateRecord(agent, SPACE, POST_COLLECTION, {})
    expect(bodyOf(calls[1])).not.toHaveProperty('rkey')
  })

  it('writes a like into the permissioned repo, never the public one', async () => {
    const {agent, calls} = agentWith()
    await spaceLike(agent, SPACE, SUBJECT)

    // The one thing that must never happen: com.atproto.repo.createRecord with
    // a space-uri subject, which would publish that the private post exists.
    expect(calls[0].path).toBe('/xrpc/com.atproto.space.createRecord')
    expect(calls[0].path).not.toContain('com.atproto.repo')
    expect(bodyOf(calls[0])).toMatchObject({
      space: SPACE,
      collection: LIKE_COLLECTION,
      record: {$type: LIKE_COLLECTION, subject: SUBJECT},
    })
  })

  it('unlikes by the rkey of the like record', async () => {
    const {agent, calls} = agentWith({body: {}})
    await spaceUnlike(
      agent,
      SPACE,
      `${SPACE}/did:plc:me/${LIKE_COLLECTION}/3klike`,
    )

    expect(calls[0].path).toBe('/xrpc/com.atproto.space.deleteRecord')
    expect(bodyOf(calls[0])).toEqual({
      space: SPACE,
      collection: LIKE_COLLECTION,
      rkey: '3klike',
    })
  })

  it('deletes one of the caller’s own records', async () => {
    const {agent, calls} = agentWith({body: {}})
    await spaceDeleteRecord(agent, SPACE, POST_COLLECTION, '3kpost')
    expect(bodyOf(calls[0]).rkey).toBe('3kpost')
  })

  it('reads a 404 as “this pds has no space support”', async () => {
    const {agent} = agentWith({status: 404})
    // A PDS that never heard of the method answers 404 rather than an XRPC
    // error; that is how a foreign-PDS account is recognised so the UI can
    // offer migration instead of a generic failure.
    await expect(
      spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}),
    ).rejects.toBeInstanceOf(SpaceUnsupportedError)
  })

  it('surfaces the host’s own message on other failures', async () => {
    const {agent} = agentWith({
      status: 429,
      body: {error: 'RateLimitExceeded', message: 'records quota exceeded'},
    })
    await expect(
      spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}),
    ).rejects.toThrow('records quota exceeded')
  })

  it('refuses a response that names no record', async () => {
    const {agent} = agentWith({body: {cid: 'bafyreinew'}})
    await expect(
      spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}),
    ).rejects.toThrow(/no record reference/)
  })
})
