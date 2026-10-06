import {type AtpAgent} from '@atproto/api'
import {TID} from '@atproto/common-web'
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  ASSEMBLY_CONVERSATION_COLLECTION,
  ASSEMBLY_CREATE_LXM,
  AssemblyError,
  assemblyFingerprint,
  assemblyReportUrl,
  assemblyThumbUrl,
  assemblyUrl,
  buildAssemblyExternal,
  ensureAssembly,
  isAssemblyConversationId,
} from '#/lib/api/assembly'
import {type AssemblyRef} from '#/lib/api/poll'
import {parseEmbedPlayerFromUrl} from '#/lib/strings/embed-player'

jest.mock('#/env', () => mockEnv('https://assembly.blacksky.community'))

function mockEnv(url: string) {
  return {
    ...jest.requireActual<Record<string, unknown>>('#/env'),
    ASSEMBLY_URL: url,
    ASSEMBLY_SERVICE_DID: 'did:web:assembly.blacksky.community',
  }
}

const NOW = new Date('2026-09-27T12:00:00.000Z')
const NOW_SECONDS = 1790510400
const DID = 'did:plc:author'
const CID = 'bafyreiconversation'
const RKEY = '3m2kqzvnqbc2a'
const NEXT_RKEY = '3m2kqzvnqbd2a'
const TOPIC = 'Should the garden stay open late?'
const STATEMENTS = ['Yes, until sunset', 'Only on weekends']
const FINGERPRINT =
  '["Should the garden stay open late?",["Yes, until sunset","Only on weekends"]]'
const ENDPOINT =
  'https://assembly.blacksky.community/api/v3/atproto/conversations'
const AT_URI = `at://did:plc:author/community.blacksky.assembly.conversation/${RKEY}`
const BODY = JSON.stringify({
  topic: TOPIC,
  statements: STATEMENTS,
  conversation: {at_uri: AT_URI, at_cid: CID},
})
const INCOMPLETE = {error: 'polis_err_atproto_statement_records_incomplete'}
const CREATED = {conversation_id: '2demo', report_id: 'r7report', created: true}

type RecordInput = {
  repo: string
  collection: string
  rkey: string
  record?: Record<string, unknown>
}
type TokenInput = {aud: string; lxm: string; exp: number}

const fetchMock = jest.fn<typeof fetch>()

function reply(status: number, body: unknown) {
  return {
    ok: status < 400,
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
}

function setup() {
  const events: string[] = []
  const refs: AssemblyRef[] = []
  let tokens = 0
  const putRecord = jest.fn((input: RecordInput) => {
    events.push('putRecord')
    return Promise.resolve({
      data: {
        uri: `at://${input.repo}/${input.collection}/${input.rkey}`,
        cid: CID,
      },
    })
  })
  const deleteRecord = jest.fn<(input: RecordInput) => Promise<{data: object}>>(
    () => {
      events.push('deleteRecord')
      return Promise.resolve({data: {}})
    },
  )
  const getServiceAuth = jest.fn<
    (input: TokenInput) => Promise<{data: {token: string}}>
  >(() => {
    events.push('getServiceAuth')
    tokens += 1
    return Promise.resolve({data: {token: `token-${tokens}`}})
  })
  const onRef = jest.fn((ref: AssemblyRef) => {
    events.push('onRef')
    refs.push(ref)
  })
  const pause = jest.fn<(ms: number) => Promise<void>>(() => {
    events.push('pause')
    return Promise.resolve()
  })
  const agent = {
    assertDid: DID,
    dispatchUrl: 'https://pds.example/',
    com: {
      atproto: {
        repo: {putRecord, deleteRecord},
        server: {getServiceAuth},
      },
    },
  } as unknown as AtpAgent
  return {
    agent,
    events,
    refs,
    putRecord,
    deleteRecord,
    getServiceAuth,
    onRef,
    pause,
  }
}

function respondWith(...responses: Response[]) {
  for (const response of responses) {
    fetchMock.mockImplementationOnce(() => Promise.resolve(response))
  }
}

function describeError(error: unknown) {
  const fields: Record<string, unknown> = {}
  if (error instanceof Error) {
    for (const key of Object.getOwnPropertyNames(error)) {
      if (key !== 'stack') fields[key] = Reflect.get(error, key)
    }
  }
  return fields
}

function sentRequest(call: number) {
  const [url, init] = fetchMock.mock.calls[call]
  return {url, init: init as RequestInit}
}

beforeEach(() => {
  jest.useFakeTimers({now: NOW})
  global.fetch = fetchMock
  fetchMock.mockReset()
  jest.spyOn(TID, 'nextStr').mockReturnValue(RKEY)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('assemblyFingerprint', () => {
  it('is the JSON of the topic and the ordered statements', () => {
    expect(assemblyFingerprint(TOPIC, STATEMENTS)).toBe(FINGERPRINT)
    expect(assemblyFingerprint('T', ['B', 'A'])).toBe('["T",["B","A"]]')
    expect(assemblyFingerprint('T', ['A', 'B'])).toBe('["T",["A","B"]]')
  })

  it('ignores differences that normalisation removes', () => {
    expect(assemblyFingerprint('  T \n', [' café '])).toBe('["T",["café"]]')
  })

  it('keeps the topic apart from the statements', () => {
    expect(assemblyFingerprint('A', ['B'])).toBe('["A",["B"]]')
    expect(assemblyFingerprint('A', [])).toBe('["A",[]]')
    expect(assemblyFingerprint('A","B', [])).toBe('["A\\",\\"B",[]]')
  })
})

describe('isAssemblyConversationId', () => {
  it.each(['2demo', '7abcDEF123', '12345', '0zzzzzzzzzzzzzzz'])(
    'accepts %s',
    value => {
      expect(isAssemblyConversationId(value)).toBe(true)
    },
  )

  it.each([
    'demo2',
    'a2demo',
    '2dem',
    '2de-mo',
    '2demo/x',
    ' 2demo',
    '2demo\n',
    '',
    12345,
    null,
    undefined,
    ['2demo'],
  ])('rejects %p', value => {
    expect(isAssemblyConversationId(value)).toBe(false)
  })
})

describe('assembly links', () => {
  it('builds the conversation, results and thumbnail addresses', () => {
    expect(assemblyUrl('2demo')).toBe(
      'https://assembly.blacksky.community/2demo',
    )
    expect(assemblyReportUrl('r7report')).toBe(
      'https://assembly.blacksky.community/report/r7report',
    )
    expect(assemblyThumbUrl('2demo')).toBe(
      'https://assembly.blacksky.community/api/v3/og-image/2demo',
    )
  })

  it.each(['2demo', '7abcDEF123', '12345', '0zzzzzzzzzzzzzzz'])(
    'links %s where the in-app card finds it',
    value => {
      expect(parseEmbedPlayerFromUrl(assemblyUrl(value))).toStrictEqual({
        type: 'assembly_conversation',
        source: 'assembly',
        playerUri: `https://assembly.blacksky.community/${value}`,
        hideDetails: false,
      })
    },
  )

  it('keeps an identifier inside its path segment', () => {
    expect(assemblyUrl('2demo/../x')).toBe(
      'https://assembly.blacksky.community/2demo%2F..%2Fx',
    )
    expect(assemblyReportUrl('r7?x=1')).toBe(
      'https://assembly.blacksky.community/report/r7%3Fx%3D1',
    )
  })
})

describe('buildAssemblyExternal', () => {
  it('links the conversation and lists the statements by number', () => {
    expect(
      buildAssemblyExternal({
        conversationId: '2demo',
        topic: TOPIC,
        statements: STATEMENTS,
      }),
    ).toStrictEqual({
      uri: 'https://assembly.blacksky.community/2demo',
      title: 'Should the garden stay open late?',
      description: '1. Yes, until sunset\n2. Only on weekends',
    })
  })

  it('numbers a single statement', () => {
    expect(
      buildAssemblyExternal({
        conversationId: '2demo',
        topic: 'T',
        statements: ['Only one'],
      }).description,
    ).toBe('1. Only one')
  })
})

describe('AssemblyError', () => {
  it('carries the code and the stage', () => {
    const error = new AssemblyError('quota', 'create')
    expect(error).toBeInstanceOf(AssemblyError)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AssemblyError')
    expect(error.code).toBe('quota')
    expect(error.stage).toBe('create')
  })
})

describe('ensureAssembly', () => {
  it('writes the record, asks for a token and creates the conversation', async () => {
    const {agent, events, putRecord, deleteRecord, getServiceAuth, onRef} =
      setup()
    respondWith(reply(201, CREATED))

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    })

    expect(ASSEMBLY_CONVERSATION_COLLECTION).toBe(
      'community.blacksky.assembly.conversation',
    )
    expect(ASSEMBLY_CREATE_LXM).toBe(
      'community.blacksky.assembly.createConversation',
    )
    expect(putRecord.mock.calls).toStrictEqual([
      [
        {
          repo: 'did:plc:author',
          collection: 'community.blacksky.assembly.conversation',
          rkey: RKEY,
          record: {
            $type: 'community.blacksky.assembly.conversation',
            topic: TOPIC,
            authRequired: true,
            createdAt: '2026-09-27T12:00:00.000Z',
          },
        },
      ],
    ])
    expect(getServiceAuth.mock.calls).toStrictEqual([
      [
        {
          aud: 'did:web:assembly.blacksky.community',
          lxm: 'community.blacksky.assembly.createConversation',
          exp: NOW_SECONDS + 60,
        },
      ],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const {url, init} = sentRequest(0)
    expect(url).toBe(ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers).toStrictEqual({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    })
    expect(init.body).toBe(
      '{"topic":"Should the garden stay open late?","statements":["Yes, until sunset","Only on weekends"],"conversation":{"at_uri":"at://did:plc:author/community.blacksky.assembly.conversation/3m2kqzvnqbc2a","at_cid":"bafyreiconversation"}}',
    )
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(result).toStrictEqual({
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint: FINGERPRINT,
        conversationId: '2demo',
        reportId: 'r7report',
      },
      isReplay: false,
    })
    expect(events).toStrictEqual([
      'onRef',
      'putRecord',
      'getServiceAuth',
      'onRef',
    ])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('reports the reference before the first request and again with the conversation', async () => {
    const {agent, putRecord, getServiceAuth, onRef} = setup()
    const seenAtFirstReport: number[] = []
    onRef.mockImplementationOnce(() => {
      seenAtFirstReport.push(
        putRecord.mock.calls.length,
        getServiceAuth.mock.calls.length,
        fetchMock.mock.calls.length,
      )
    })
    respondWith(reply(201, CREATED))

    await ensureAssembly(agent, {topic: TOPIC, statements: STATEMENTS, onRef})

    expect(seenAtFirstReport).toStrictEqual([0, 0, 0])
    expect(onRef.mock.calls).toStrictEqual([
      [
        {
          rkey: RKEY,
          createdAt: '2026-09-27T12:00:00.000Z',
          fingerprint: FINGERPRINT,
        },
      ],
      [
        {
          rkey: RKEY,
          createdAt: '2026-09-27T12:00:00.000Z',
          fingerprint: FINGERPRINT,
          conversationId: '2demo',
          reportId: 'r7report',
        },
      ],
    ])
  })

  it('reports a replay when the server did not create the conversation', async () => {
    const {agent, onRef} = setup()
    respondWith(
      reply(200, {
        conversation_id: '2demo',
        report_id: 'r7report',
        created: false,
      }),
    )

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    })

    expect(result.isReplay).toBe(true)
    expect(result.ref.conversationId).toBe('2demo')
  })

  it.each([
    {answer: 'leaves it out', status: 200, body: {conversation_id: '2demo'}},
    {
      answer: 'says null',
      status: 200,
      body: {conversation_id: '2demo', created: null},
    },
    {
      answer: 'says true',
      status: 200,
      body: {conversation_id: '2demo', created: true},
    },
  ])(
    'reports a new conversation when the server $answer',
    async ({status, body}) => {
      const {agent, onRef} = setup()
      respondWith(reply(status, body))

      const result = await ensureAssembly(agent, {
        topic: TOPIC,
        statements: STATEMENTS,
        onRef,
      })

      expect(result.isReplay).toBe(false)
      expect(result.ref.conversationId).toBe('2demo')
    },
  )

  it.each([
    {report: 'absent', body: {conversation_id: '2demo', created: true}},
    {
      report: 'null',
      body: {conversation_id: '2demo', report_id: null, created: true},
    },
    {
      report: 'empty',
      body: {conversation_id: '2demo', report_id: '', created: true},
    },
    {
      report: 'not text',
      body: {conversation_id: '2demo', report_id: 7, created: true},
    },
  ])('leaves the results reference out when it is $report', async ({body}) => {
    const {agent, onRef} = setup()
    respondWith(reply(201, body))

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    })

    const expected = {
      rkey: RKEY,
      createdAt: '2026-09-27T12:00:00.000Z',
      fingerprint: FINGERPRINT,
      conversationId: '2demo',
    }
    expect(result).toStrictEqual({ref: expected, isReplay: false})
    expect(onRef.mock.calls[1]).toStrictEqual([expected])
  })

  it('sends the normalised topic and statements', async () => {
    const {agent, putRecord, onRef} = setup()
    respondWith(reply(201, CREATED))

    const result = await ensureAssembly(agent, {
      topic: `  ${TOPIC}\n`,
      statements: [' Yes, until sunset ', 'Only on weekends\n'],
      onRef,
    })

    expect(putRecord.mock.calls[0][0].record?.topic).toBe(TOPIC)
    expect(sentRequest(0).init.body).toBe(BODY)
    expect(result.ref.fingerprint).toBe(FINGERPRINT)
  })

  it('makes no request when the reference already has its conversation', async () => {
    const {agent, putRecord, deleteRecord, getServiceAuth, onRef} = setup()
    const ref = {
      rkey: RKEY,
      createdAt: '2026-09-01T08:30:00.000Z',
      fingerprint: FINGERPRINT,
      conversationId: '2demo',
      reportId: 'r7report',
    }

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref,
      onRef,
    })

    expect(result).toStrictEqual({ref, isReplay: true})
    expect(putRecord).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(getServiceAuth).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onRef).not.toHaveBeenCalled()
    expect(TID.nextStr).not.toHaveBeenCalled()
  })

  it('repeats the identical record and request on a retry', async () => {
    const {agent, refs, putRecord, deleteRecord, onRef} = setup()
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Network request failed')),
    )
    await expect(
      ensureAssembly(agent, {topic: TOPIC, statements: STATEMENTS, onRef}),
    ).rejects.toMatchObject({code: 'network', stage: 'create'})
    expect(refs).toStrictEqual([
      {
        rkey: RKEY,
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint: FINGERPRINT,
      },
    ])

    jest.setSystemTime(new Date('2026-09-27T12:05:00.000Z'))
    jest.mocked(TID.nextStr).mockReturnValue(NEXT_RKEY)
    respondWith(reply(200, {...CREATED, created: false}))

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: refs[0],
      onRef,
    })

    expect(putRecord).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(putRecord.mock.calls[1][0])).toBe(
      JSON.stringify(putRecord.mock.calls[0][0]),
    )
    expect(putRecord.mock.calls[1][0]).toStrictEqual({
      repo: DID,
      collection: 'community.blacksky.assembly.conversation',
      rkey: RKEY,
      record: {
        $type: 'community.blacksky.assembly.conversation',
        topic: TOPIC,
        authRequired: true,
        createdAt: '2026-09-27T12:00:00.000Z',
      },
    })
    expect(sentRequest(0).init.body).toBe(BODY)
    expect(sentRequest(1).init.body).toBe(BODY)
    expect(TID.nextStr).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(result).toStrictEqual({
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint: FINGERPRINT,
        conversationId: '2demo',
        reportId: 'r7report',
      },
      isReplay: true,
    })
  })

  it('starts over with a new record when the text changed', async () => {
    const {agent, events, putRecord, deleteRecord, onRef} = setup()
    jest.mocked(TID.nextStr).mockReturnValue(NEXT_RKEY)
    respondWith(reply(201, CREATED))

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: ['Yes, until sunset', 'Never'],
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
      },
      onRef,
    })

    const fingerprint =
      '["Should the garden stay open late?",["Yes, until sunset","Never"]]'
    expect(deleteRecord.mock.calls).toStrictEqual([
      [
        {
          repo: DID,
          collection: 'community.blacksky.assembly.conversation',
          rkey: RKEY,
        },
      ],
    ])
    expect(putRecord.mock.calls[0][0].rkey).toBe(NEXT_RKEY)
    expect(putRecord.mock.calls[0][0].record?.createdAt).toBe(
      '2026-09-27T12:00:00.000Z',
    )
    expect(onRef.mock.calls[0]).toStrictEqual([
      {
        rkey: NEXT_RKEY,
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint,
      },
    ])
    expect(sentRequest(0).init.body).toBe(
      '{"topic":"Should the garden stay open late?","statements":["Yes, until sunset","Never"],"conversation":{"at_uri":"at://did:plc:author/community.blacksky.assembly.conversation/3m2kqzvnqbd2a","at_cid":"bafyreiconversation"}}',
    )
    expect(result.ref.rkey).toBe(NEXT_RKEY)
    expect(result.ref.fingerprint).toBe(fingerprint)
    expect(events).toStrictEqual([
      'onRef',
      'deleteRecord',
      'putRecord',
      'getServiceAuth',
      'onRef',
    ])
  })

  it('treats a reordering of the statements as a change', async () => {
    const {agent, putRecord, deleteRecord, onRef} = setup()
    jest.mocked(TID.nextStr).mockReturnValue(NEXT_RKEY)
    respondWith(reply(201, CREATED))

    await ensureAssembly(agent, {
      topic: TOPIC,
      statements: ['Only on weekends', 'Yes, until sunset'],
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
      },
      onRef,
    })

    expect(deleteRecord.mock.calls[0][0].rkey).toBe(RKEY)
    expect(putRecord.mock.calls[0][0].rkey).toBe(NEXT_RKEY)
  })

  it('continues when the old record cannot be deleted', async () => {
    const {agent, putRecord, deleteRecord, onRef} = setup()
    jest.mocked(TID.nextStr).mockReturnValue(NEXT_RKEY)
    deleteRecord.mockImplementationOnce(() =>
      Promise.reject(new Error('Network request failed')),
    )
    respondWith(reply(201, CREATED))

    const result = await ensureAssembly(agent, {
      topic: 'A different question',
      statements: STATEMENTS,
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
      },
      onRef,
    })

    expect(deleteRecord).toHaveBeenCalledTimes(1)
    expect(putRecord.mock.calls[0][0].rkey).toBe(NEXT_RKEY)
    expect(result.ref.conversationId).toBe('2demo')
  })

  it('keeps the record of a conversation that already exists when the text changed', async () => {
    const {agent, putRecord, deleteRecord, onRef} = setup()
    jest.mocked(TID.nextStr).mockReturnValue(NEXT_RKEY)
    respondWith(reply(201, {conversation_id: '3other', created: true}))

    const result = await ensureAssembly(agent, {
      topic: 'A different question',
      statements: STATEMENTS,
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
        conversationId: '2demo',
        reportId: 'r7report',
      },
      onRef,
    })

    const fresh = {
      rkey: NEXT_RKEY,
      createdAt: '2026-09-27T12:00:00.000Z',
      fingerprint:
        '["A different question",["Yes, until sunset","Only on weekends"]]',
    }
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(putRecord.mock.calls[0][0].rkey).toBe(NEXT_RKEY)
    expect(onRef.mock.calls).toStrictEqual([
      [fresh],
      [{...fresh, conversationId: '3other'}],
    ])
    expect(result).toStrictEqual({
      ref: {...fresh, conversationId: '3other'},
      isReplay: false,
    })
  })

  it('asks the server again when a stored conversation id is not usable', async () => {
    const {agent, putRecord, deleteRecord, onRef} = setup()
    respondWith(reply(200, {...CREATED, created: false}))

    const result = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
        conversationId: 'not/an/id',
      },
      onRef,
    })

    expect(TID.nextStr).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(putRecord.mock.calls[0][0].rkey).toBe(RKEY)
    expect(putRecord.mock.calls[0][0].record?.createdAt).toBe(
      '2026-09-01T08:30:00.000Z',
    )
    expect(onRef.mock.calls[0]).toStrictEqual([
      {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
      },
    ])
    expect(result.ref.conversationId).toBe('2demo')
    expect(result.isReplay).toBe(true)
  })

  it.each([
    [400, 'polis_err_atproto_conversation_statements_invalid', 'invalid'],
    [403, 'polis_err_atproto_conversation_not_eligible', 'not_eligible'],
    [400, 'polis_err_atproto_unsupported_did', 'not_eligible'],
    [403, 'polis_err_atproto_record_did_mismatch', 'not_eligible'],
    [410, 'polis_err_atproto_conversation_removed', 'removed'],
    [429, 'polis_err_atproto_conversation_quota_exceeded', 'quota'],
  ])(
    'deletes the record when the server refuses with %i %s',
    async (status, error, code) => {
      const {agent, events, deleteRecord, onRef, pause} = setup()
      respondWith(reply(status, {error}))

      const failure = await ensureAssembly(
        agent,
        {topic: TOPIC, statements: STATEMENTS, onRef},
        {pause},
      ).catch((e: unknown) => e)

      expect(failure).toBeInstanceOf(AssemblyError)
      expect(failure).toMatchObject({code, stage: 'create'})
      expect(deleteRecord.mock.calls).toStrictEqual([
        [
          {
            repo: DID,
            collection: 'community.blacksky.assembly.conversation',
            rkey: RKEY,
          },
        ],
      ])
      expect(events).toStrictEqual([
        'onRef',
        'putRecord',
        'getServiceAuth',
        'deleteRecord',
      ])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('starts over with a new record after a conflict', async () => {
    const {agent, events, refs, putRecord, deleteRecord, onRef} = setup()
    jest
      .spyOn(TID, 'nextStr')
      .mockReturnValueOnce(RKEY)
      .mockReturnValueOnce(NEXT_RKEY)
    respondWith(
      reply(409, {
        error: 'polis_err_atproto_conversation_idempotency_mismatch',
      }),
      reply(201, CREATED),
    )

    const failure = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'conflict', stage: 'create'})
    expect(events).toStrictEqual([
      'onRef',
      'putRecord',
      'getServiceAuth',
      'deleteRecord',
      'onRef',
    ])
    expect(deleteRecord.mock.calls).toStrictEqual([
      [{repo: DID, collection: ASSEMBLY_CONVERSATION_COLLECTION, rkey: RKEY}],
    ])
    expect(refs[1]).toStrictEqual({
      rkey: NEXT_RKEY,
      createdAt: NOW.toISOString(),
      fingerprint: FINGERPRINT,
    })

    const retried = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: refs[1],
      onRef,
    })

    expect(putRecord.mock.calls.map(([input]) => input.rkey)).toStrictEqual([
      RKEY,
      NEXT_RKEY,
    ])
    expect(deleteRecord).toHaveBeenCalledTimes(1)
    expect(retried.ref.conversationId).toBe('2demo')
    expect(retried.ref.rkey).toBe(NEXT_RKEY)
  })

  it('keeps the record and the reference when too many requests came from one address', async () => {
    const {agent, deleteRecord, onRef, refs} = setup()
    respondWith(
      reply(429, {error: 'polis_err_atproto_conversation_rate_limited'}),
      reply(201, {
        conversation_id: '2demo',
        report_id: 'r2demo',
        created: true,
      }),
    )

    await expect(
      ensureAssembly(agent, {topic: TOPIC, statements: STATEMENTS, onRef}),
    ).rejects.toMatchObject({code: 'busy', stage: 'create'})
    expect(deleteRecord).toHaveBeenCalledTimes(0)
    const kept = refs[refs.length - 1]

    const retried = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: kept,
      onRef,
    })

    expect(retried.ref.rkey).toBe(kept.rkey)
    expect(retried.ref.conversationId).toBe('2demo')
    expect(deleteRecord).toHaveBeenCalledTimes(0)
  })

  it('still reports the refusal when the record cannot be deleted', async () => {
    const {agent, deleteRecord, onRef} = setup()
    deleteRecord.mockImplementationOnce(() =>
      Promise.reject(new Error('Network request failed')),
    )
    respondWith(
      reply(429, {error: 'polis_err_atproto_conversation_quota_exceeded'}),
    )

    await expect(
      ensureAssembly(agent, {topic: TOPIC, statements: STATEMENTS, onRef}),
    ).rejects.toMatchObject({code: 'quota', stage: 'create'})
    expect(deleteRecord).toHaveBeenCalledTimes(1)
  })

  it.each([
    [401, 'polis_err_atproto_auth_invalid', 'auth'],
    [404, 'polis_err_not_found', 'unavailable'],
    [500, 'polis_err_internal', 'unavailable'],
    [502, 'bad_gateway', 'unavailable'],
    [503, 'polis_err_atproto_conversations_disabled', 'unavailable'],
    [503, 'polis_err_atproto_seed_publisher_unavailable', 'unavailable'],
    [503, 'polis_err_atproto_did_resolution_failed', 'unavailable'],
    [500, 'polis_err_atproto_statement_records_incomplete', 'unavailable'],
    [204, '', 'unavailable'],
  ])(
    'keeps the record and does not resend on %i %s',
    async (status, error, code) => {
      const {agent, deleteRecord, onRef, pause} = setup()
      respondWith(reply(status, {error}))

      const failure = await ensureAssembly(
        agent,
        {topic: TOPIC, statements: STATEMENTS, onRef},
        {pause},
      ).catch((e: unknown) => e)

      expect(failure).toBeInstanceOf(AssemblyError)
      expect(failure).toMatchObject({code, stage: 'create'})
      expect(deleteRecord).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(pause).not.toHaveBeenCalled()
      expect(onRef).toHaveBeenCalledTimes(1)
    },
  )

  it('does not accept a conversation from any other success status', async () => {
    const {agent, deleteRecord, onRef} = setup()
    respondWith(reply(202, CREATED))

    const failure = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'unavailable', stage: 'create'})
    expect(onRef).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('keeps the record when the request cannot be delivered', async () => {
    const {agent, deleteRecord, onRef} = setup()
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    )

    const failure = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'network', stage: 'create'})
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(onRef).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the record when the response cannot be read', async () => {
    const {agent, deleteRecord, onRef} = setup()
    respondWith({
      ok: true,
      status: 201,
      text: () => Promise.reject(new TypeError('Network request failed')),
    } as Response)

    await expect(
      ensureAssembly(agent, {topic: TOPIC, statements: STATEMENTS, onRef}),
    ).rejects.toMatchObject({code: 'network', stage: 'create'})
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('gives up after thirty seconds without an answer', async () => {
    const {agent, deleteRecord, onRef} = setup()
    fetchMock.mockImplementationOnce(
      (url, init) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          )
        }),
    )
    let failure: unknown
    const pending = ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => {
      failure = e
    })

    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(29999)
    expect(sentRequest(0).init.signal?.aborted).toBe(false)
    expect(failure).toBeUndefined()
    await jest.advanceTimersByTimeAsync(1)
    await pending

    expect(sentRequest(0).init.signal?.aborted).toBe(true)
    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'network', stage: 'create'})
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('gives up when the answer is still arriving after thirty seconds', async () => {
    const {agent, deleteRecord, onRef} = setup()
    fetchMock.mockImplementationOnce((url, init) =>
      Promise.resolve({
        ok: true,
        status: 201,
        text: () =>
          new Promise<string>((resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('Aborted')),
            )
          }),
      } as Response),
    )
    let failure: unknown
    const pending = ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => {
      failure = e
    })

    await jest.advanceTimersByTimeAsync(29999)
    expect(failure).toBeUndefined()
    expect(jest.getTimerCount()).toBe(1)
    await jest.advanceTimersByTimeAsync(1)
    await pending

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'network', stage: 'create'})
    expect(onRef).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('resends with a fresh token while the statement records are incomplete', async () => {
    const {
      agent,
      events,
      putRecord,
      getServiceAuth,
      deleteRecord,
      onRef,
      pause,
    } = setup()
    respondWith(reply(503, INCOMPLETE), reply(201, CREATED))

    const result = await ensureAssembly(
      agent,
      {topic: TOPIC, statements: STATEMENTS, onRef},
      {pause},
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentRequest(0).init.headers).toStrictEqual({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    })
    expect(sentRequest(1).init.headers).toStrictEqual({
      Authorization: 'Bearer token-2',
      'Content-Type': 'application/json',
    })
    expect(sentRequest(0).init.body).toBe(BODY)
    expect(sentRequest(1).init.body).toBe(BODY)
    expect(sentRequest(1).url).toBe(ENDPOINT)
    expect(getServiceAuth).toHaveBeenCalledTimes(2)
    expect(putRecord).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(pause.mock.calls).toStrictEqual([[1000]])
    expect(events).toStrictEqual([
      'onRef',
      'putRecord',
      'getServiceAuth',
      'pause',
      'getServiceAuth',
      'onRef',
    ])
    expect(result).toStrictEqual({
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-27T12:00:00.000Z',
        fingerprint: FINGERPRINT,
        conversationId: '2demo',
        reportId: 'r7report',
      },
      isReplay: false,
    })
  })

  it('succeeds on the third attempt', async () => {
    const {agent, onRef, pause} = setup()
    respondWith(
      reply(503, INCOMPLETE),
      reply(503, INCOMPLETE),
      reply(200, {...CREATED, created: false}),
    )

    const result = await ensureAssembly(
      agent,
      {topic: TOPIC, statements: STATEMENTS, onRef},
      {pause},
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sentRequest(2).init.headers).toStrictEqual({
      Authorization: 'Bearer token-3',
      'Content-Type': 'application/json',
    })
    expect(pause.mock.calls).toStrictEqual([[1000], [1000]])
    expect(result.ref.conversationId).toBe('2demo')
    expect(result.isReplay).toBe(true)
  })

  it('gives up after the third incomplete attempt and keeps the record', async () => {
    const {agent, getServiceAuth, deleteRecord, onRef, pause} = setup()
    respondWith(
      reply(503, INCOMPLETE),
      reply(503, INCOMPLETE),
      reply(503, INCOMPLETE),
      reply(201, CREATED),
    )

    const failure = await ensureAssembly(
      agent,
      {topic: TOPIC, statements: STATEMENTS, onRef},
      {pause},
    ).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'unavailable', stage: 'create'})
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getServiceAuth).toHaveBeenCalledTimes(3)
    expect(pause.mock.calls).toStrictEqual([[1000], [1000]])
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(onRef).toHaveBeenCalledTimes(1)
  })

  it('stops resending when a later attempt is refused', async () => {
    const {agent, deleteRecord, onRef, pause} = setup()
    respondWith(
      reply(503, INCOMPLETE),
      reply(403, {error: 'polis_err_atproto_conversation_not_eligible'}),
    )

    await expect(
      ensureAssembly(
        agent,
        {topic: TOPIC, statements: STATEMENTS, onRef},
        {pause},
      ),
    ).rejects.toMatchObject({code: 'not_eligible', stage: 'create'})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(pause.mock.calls).toStrictEqual([[1000]])
    expect(deleteRecord).toHaveBeenCalledTimes(1)
  })

  it('waits one second between attempts by default', async () => {
    const {agent, getServiceAuth, onRef} = setup()
    respondWith(reply(503, INCOMPLETE), reply(201, CREATED))

    const pending = ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    })

    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(pending).resolves.toMatchObject({
      ref: {conversationId: '2demo'},
      isReplay: false,
    })
    expect(getServiceAuth.mock.calls.map(([input]) => input.exp)).toStrictEqual(
      [NOW_SECONDS + 60, NOW_SECONDS + 61],
    )
  })

  it.each([
    {
      problem: 'without a leading digit',
      body: {conversation_id: 'demo2', created: true},
    },
    {
      problem: 'that is too short',
      body: {conversation_id: '2dem', created: true},
    },
    {
      problem: 'that is not text',
      body: {conversation_id: 12345, created: true},
    },
    {problem: 'that is missing', body: {created: true}},
    {problem: 'in a body that is not an object', body: ['2demo']},
    {problem: 'in a body that is not JSON', body: '<html>2demo</html>'},
  ])('rejects a conversation id $problem', async ({body}) => {
    const {agent, deleteRecord, onRef} = setup()
    respondWith(reply(201, body))

    const failure = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code: 'unavailable', stage: 'create'})
    expect(onRef).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it.each([
    ['Network request failed', 'network'],
    ['Record could not be written', 'unavailable'],
  ])(
    'stops at the record when writing fails with %s',
    async (message, code) => {
      const {agent, putRecord, getServiceAuth, deleteRecord, onRef} = setup()
      putRecord.mockImplementationOnce(() => Promise.reject(new Error(message)))

      const failure = await ensureAssembly(agent, {
        topic: TOPIC,
        statements: STATEMENTS,
        onRef,
      }).catch((e: unknown) => e)

      expect(failure).toBeInstanceOf(AssemblyError)
      expect(failure).toMatchObject({code, stage: 'record'})
      expect(onRef).toHaveBeenCalledTimes(1)
      expect(getServiceAuth).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(deleteRecord).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['Bad token scope', 'auth'],
    ['Network request failed', 'network'],
  ])('stops at the token when it fails with %s', async (message, code) => {
    const {agent, getServiceAuth, deleteRecord, onRef} = setup()
    getServiceAuth.mockImplementationOnce(() =>
      Promise.reject(new Error(message)),
    )

    const failure = await ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      onRef,
    }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(AssemblyError)
    expect(failure).toMatchObject({code, stage: 'token'})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('keeps the token out of the console and out of the error', async () => {
    const {agent, onRef, pause} = setup()
    const written: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        for (const arg of args) {
          written.push(
            arg instanceof Error
              ? `${arg.message} ${arg.stack}`
              : JSON.stringify(arg),
          )
        }
      })
    }
    respondWith(
      reply(503, INCOMPLETE),
      reply(403, {error: 'polis_err_atproto_conversation_not_eligible'}),
    )
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Network request failed')),
    )

    const refused = await ensureAssembly(
      agent,
      {topic: TOPIC, statements: STATEMENTS, onRef},
      {pause},
    ).catch((e: unknown) => e)
    const undelivered = await ensureAssembly(
      agent,
      {topic: TOPIC, statements: STATEMENTS, onRef},
      {pause},
    ).catch((e: unknown) => e)

    expect(sentRequest(1).init.headers).toStrictEqual({
      Authorization: 'Bearer token-2',
      'Content-Type': 'application/json',
    })
    expect(sentRequest(2).init.headers).toStrictEqual({
      Authorization: 'Bearer token-3',
      'Content-Type': 'application/json',
    })
    expect(refused).toBeInstanceOf(AssemblyError)
    expect(undelivered).toBeInstanceOf(AssemblyError)
    expect(describeError(refused)).toStrictEqual({
      message: 'not_eligible',
      name: 'AssemblyError',
      code: 'not_eligible',
      stage: 'create',
    })
    expect(describeError(undelivered)).toStrictEqual({
      message: 'network',
      name: 'AssemblyError',
      code: 'network',
      stage: 'create',
    })
    expect(written.join('\n')).not.toContain('token-')
  })
})

describe('a configured assembly address', () => {
  afterEach(() => {
    jest.resetModules()
    jest.doMock('#/env', () => mockEnv('https://assembly.blacksky.community'))
  })

  it('drops the trailing slash before building addresses', async () => {
    jest.resetModules()
    jest.doMock('#/env', () => mockEnv('http://localhost:5000/'))
    const local = jest.requireActual<{
      ensureAssembly: typeof ensureAssembly
      assemblyUrl: typeof assemblyUrl
      assemblyReportUrl: typeof assemblyReportUrl
      assemblyThumbUrl: typeof assemblyThumbUrl
    }>('#/lib/api/assembly')
    const {agent, onRef} = setup()
    respondWith(reply(201, CREATED))

    await local.ensureAssembly(agent, {
      topic: TOPIC,
      statements: STATEMENTS,
      ref: {
        rkey: RKEY,
        createdAt: '2026-09-01T08:30:00.000Z',
        fingerprint: FINGERPRINT,
      },
      onRef,
    })

    expect(sentRequest(0).url).toBe(
      'http://localhost:5000/api/v3/atproto/conversations',
    )
    expect(local.assemblyUrl('2demo')).toBe('http://localhost:5000/2demo')
    expect(local.assemblyReportUrl('r7report')).toBe(
      'http://localhost:5000/report/r7report',
    )
    expect(local.assemblyThumbUrl('2demo')).toBe(
      'http://localhost:5000/api/v3/og-image/2demo',
    )
  })
})
