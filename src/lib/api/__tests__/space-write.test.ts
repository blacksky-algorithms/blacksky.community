import {type BskyAgent} from '@atproto/api'
import {describe, expect, it} from '@jest/globals'

import {
  LIKE_COLLECTION,
  POST_COLLECTION,
  spaceCreateRecord,
  spaceDeleteIfSpace,
  spaceDeleteRecord,
  spaceLike,
  spaceLikeIfSpace,
  spaceUnlike,
  spaceUnlikeIfSpace,
  SpaceUnsupportedError,
} from '#/lib/api/space-write'

const SPACE = 'at://did:plc:tenant/space/community.blacksky.feed/private'
const SUBJECT = {
  uri: `${SPACE}/did:plc:alice/app.bsky.feed.post/3kabc`,
  cid: 'bafyreisubject',
}

type Call = {
  path: string
  method?: string
  headers: Record<string, string>
  body: string
}
type MockResponse = {status?: number; body?: unknown}

function agentWith(
  response: MockResponse | MockResponse[] = {},
  signedIn = true,
) {
  const calls: Call[] = []
  const responses = Array.isArray(response) ? response : [response]
  let responseIndex = 0
  const agent = {
    ...(signedIn ? {session: {did: 'did:plc:me'}} : {}),
    fetchHandler(path: string, init: RequestInit) {
      const current = responses[Math.min(responseIndex++, responses.length - 1)]
      const status = current.status ?? 200
      calls.push({
        path,
        method: init.method,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: typeof init.body === 'string' ? init.body : '',
      })
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () =>
          Promise.resolve(
            current.body ?? {uri: 'at://space/record', cid: 'bafyreinew'},
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
      repo: 'did:plc:me',
      collection: POST_COLLECTION,
      record: {$type: POST_COLLECTION, text: 'hello'},
      rkey: expect.any(String),
    })
  })

  it('uses an explicit stable rkey or generates a protocol key', async () => {
    const {agent, calls} = agentWith()
    await spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}, '3kxyz')
    expect(bodyOf(calls[0]).rkey).toBe('3kxyz')

    await spaceCreateRecord(agent, SPACE, POST_COLLECTION, {})
    expect(bodyOf(calls[1]).rkey).toEqual(expect.any(String))
  })

  it('recovers a same-rkey retry from RecordExists by authoritative readback', async () => {
    const record = {
      $type: POST_COLLECTION,
      text: 'hello',
      createdAt: '2026-08-26T12:00:00.000Z',
    }
    const original = {uri: 'at://space/original', cid: 'bafyreioriginal'}
    const {agent, calls} = agentWith([
      {body: original},
      {status: 400, body: {error: 'RecordExists'}},
      {body: {...original, value: record}},
    ])

    const first = await spaceCreateRecord(
      agent,
      SPACE,
      POST_COLLECTION,
      {...record, createdAt: '2026-08-26T12:00:01.000Z'},
      '3mstablekey',
    )
    const retry = await spaceCreateRecord(
      agent,
      SPACE,
      POST_COLLECTION,
      record,
      '3mstablekey',
    )

    expect(retry).toEqual(first)
    expect(bodyOf(calls[0]).rkey).toBe('3mstablekey')
    expect(bodyOf(calls[1]).rkey).toBe('3mstablekey')
    expect(calls[2].method).toBe('GET')
    const readback = new URL(calls[2].path, 'https://pds.example')
    expect(readback.pathname).toBe('/xrpc/com.atproto.space.getRecord')
    expect(Object.fromEntries(readback.searchParams)).toEqual({
      space: SPACE,
      repo: 'did:plc:me',
      collection: POST_COLLECTION,
      rkey: '3mstablekey',
    })
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
      repo: 'did:plc:me',
      collection: LIKE_COLLECTION,
      rkey: '3klike',
    })
  })

  it('deletes one of the caller’s own records', async () => {
    const {agent, calls} = agentWith({body: {}})
    await spaceDeleteRecord(agent, SPACE, POST_COLLECTION, '3kpost')
    expect(bodyOf(calls[0]).rkey).toBe('3kpost')
    expect(bodyOf(calls[0]).repo).toBe('did:plc:me')
  })

  it('fails before issuing a request when the agent is signed out', async () => {
    const {agent, calls} = agentWith({}, false)

    await expect(
      spaceCreateRecord(agent, SPACE, POST_COLLECTION, {}),
    ).rejects.toThrow(/sign in/i)
    await expect(
      spaceDeleteRecord(agent, SPACE, POST_COLLECTION, '3kpost'),
    ).rejects.toThrow(/sign in/i)
    expect(calls).toHaveLength(0)
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

const PUBLIC_POST = 'at://did:plc:alice/app.bsky.feed.post/3kabc'
const PUBLIC_LIKE = 'at://did:plc:alice/app.bsky.feed.like/3klike'

describe('interaction routing', () => {
  it('likes a space post into its own space', async () => {
    const {agent, calls} = agentWith()

    await spaceLikeIfSpace(agent, SUBJECT.uri, SUBJECT.cid)

    // The leak this prevents: a like in the public repo whose subject is a
    // space URI announces that the private post exists.
    expect(calls[0].path).toBe('/xrpc/com.atproto.space.createRecord')
    expect(bodyOf(calls[0])).toMatchObject({
      space: SPACE,
      collection: LIKE_COLLECTION,
    })
  })

  it('unlikes and deletes within the space the record belongs to', async () => {
    const {agent, calls} = agentWith({body: {}})

    await spaceUnlikeIfSpace(
      agent,
      `${SPACE}/did:plc:alice/${LIKE_COLLECTION}/3klike`,
    )
    await spaceDeleteIfSpace(
      agent,
      `${SPACE}/did:plc:alice/${POST_COLLECTION}/3kpost`,
    )

    expect(calls.map(bodyOf)).toEqual([
      {
        space: SPACE,
        repo: 'did:plc:me',
        collection: LIKE_COLLECTION,
        rkey: '3klike',
      },
      {
        space: SPACE,
        repo: 'did:plc:me',
        collection: POST_COLLECTION,
        rkey: '3kpost',
      },
    ])
  })

  it.each([
    ['like', (a: BskyAgent) => spaceLikeIfSpace(a, PUBLIC_POST, 'bafy')],
    ['unlike', (a: BskyAgent) => spaceUnlikeIfSpace(a, PUBLIC_LIKE)],
    ['delete', (a: BskyAgent) => spaceDeleteIfSpace(a, PUBLIC_POST)],
  ])('leaves a public %s to the public repo', (_name, run) => {
    const {agent, calls} = agentWith()

    // null means "not mine" — the caller falls back to the ordinary agent call.
    expect(run(agent)).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
