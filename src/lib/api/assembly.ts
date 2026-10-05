import {type AtpAgent} from '@atproto/api'
import {TID} from '@atproto/common-web'

import {type AssemblyRef, normalizePollText} from '#/lib/api/poll'
import {isNetworkError} from '#/lib/strings/errors'
import {ASSEMBLY_SERVICE_DID, ASSEMBLY_URL} from '#/env'
import {getServiceAuthToken} from './service-auth'

export const ASSEMBLY_CONVERSATION_COLLECTION =
  'community.blacksky.assembly.conversation'
export const ASSEMBLY_CREATE_LXM =
  'community.blacksky.assembly.createConversation'

const CREATE_TIMEOUT_MS = 30e3
const CREATE_RETRIES = 2
const CREATE_RETRY_PAUSE_MS = 1e3
const TOKEN_LIFETIME_SECONDS = 60
const RECORDS_INCOMPLETE = 'polis_err_atproto_statement_records_incomplete'
const UNSUPPORTED_ACCOUNT = 'polis_err_atproto_unsupported_did'
const RATE_LIMITED = 'polis_err_atproto_conversation_rate_limited'

export type AssemblyErrorCode =
  | 'not_eligible'
  | 'quota'
  | 'busy'
  | 'invalid'
  | 'conflict'
  | 'removed'
  | 'unavailable'
  | 'auth'
  | 'network'

export type AssemblyErrorStage = 'record' | 'token' | 'create'

export class AssemblyError extends Error {
  readonly code: AssemblyErrorCode
  readonly stage: AssemblyErrorStage

  constructor(code: AssemblyErrorCode, stage: AssemblyErrorStage) {
    super(code)
    this.name = 'AssemblyError'
    this.code = code
    this.stage = stage
  }
}

const REFUSALS: Record<number, AssemblyErrorCode> = {
  400: 'invalid',
  403: 'not_eligible',
  409: 'conflict',
  410: 'removed',
  429: 'quota',
}

type CreateResponse = {status: number; data: Record<string, unknown>}

function assemblyOrigin(): string {
  return ASSEMBLY_URL.replace(/\/+$/, '')
}

export function assemblyFingerprint(
  topic: string,
  statements: string[],
): string {
  return JSON.stringify([
    normalizePollText(topic),
    statements.map(normalizePollText),
  ])
}

export function assemblyUrl(conversationId: string): string {
  return `${assemblyOrigin()}/${encodeURIComponent(conversationId)}`
}

export function assemblyReportUrl(reportId: string): string {
  return `${assemblyOrigin()}/report/${encodeURIComponent(reportId)}`
}

export function assemblyThumbUrl(conversationId: string): string {
  return `${assemblyOrigin()}/api/v3/og-image/${encodeURIComponent(conversationId)}`
}

export function isAssemblyConversationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9][0-9A-Za-z]{4,}$/.test(value)
}

export function buildAssemblyExternal(input: {
  conversationId: string
  topic: string
  statements: string[]
}): {uri: string; title: string; description: string} {
  return {
    uri: assemblyUrl(input.conversationId),
    title: input.topic,
    description: input.statements
      .map((statement, i) => `${i + 1}. ${statement}`)
      .join('\n'),
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseBody(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  } catch {}
  return {}
}

async function removeRecord(agent: AtpAgent, rkey: string): Promise<void> {
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: ASSEMBLY_CONVERSATION_COLLECTION,
      rkey,
    })
  } catch {}
}

async function writeRecord(
  agent: AtpAgent,
  ref: AssemblyRef,
  topic: string,
  staleRkey: string | undefined,
): Promise<{uri: string; cid: string}> {
  try {
    if (staleRkey) await removeRecord(agent, staleRkey)
    const {data} = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: ASSEMBLY_CONVERSATION_COLLECTION,
      rkey: ref.rkey,
      record: {
        $type: ASSEMBLY_CONVERSATION_COLLECTION,
        topic,
        authRequired: true,
        createdAt: ref.createdAt,
      },
    })
    return {uri: data.uri, cid: data.cid}
  } catch (e) {
    throw new AssemblyError(
      isNetworkError(e) ? 'network' : 'unavailable',
      'record',
    )
  }
}

async function requestCreate(
  agent: AtpAgent,
  body: string,
): Promise<CreateResponse> {
  let token: string
  try {
    token = await getServiceAuthToken({
      agent,
      aud: ASSEMBLY_SERVICE_DID,
      lxm: ASSEMBLY_CREATE_LXM,
      exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    })
  } catch (e) {
    throw new AssemblyError(isNetworkError(e) ? 'network' : 'auth', 'token')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CREATE_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${assemblyOrigin()}/api/v3/atproto/conversations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      },
    )
    return {status: response.status, data: parseBody(await response.text())}
  } catch {
    throw new AssemblyError('network', 'create')
  } finally {
    clearTimeout(timer)
  }
}

export async function ensureAssembly(
  agent: AtpAgent,
  input: {
    topic: string
    statements: string[]
    ref?: AssemblyRef
    onRef: (ref: AssemblyRef) => void
  },
  {pause = wait}: {pause?: (ms: number) => Promise<void>} = {},
): Promise<{ref: AssemblyRef & {conversationId: string}; isReplay: boolean}> {
  const topic = normalizePollText(input.topic)
  const statements = input.statements.map(normalizePollText)
  const fingerprint = assemblyFingerprint(topic, statements)
  const previous = input.ref
  const isUnchanged = previous?.fingerprint === fingerprint

  if (
    previous &&
    isUnchanged &&
    isAssemblyConversationId(previous.conversationId)
  ) {
    return {
      ref: {...previous, conversationId: previous.conversationId},
      isReplay: true,
    }
  }

  const ref: AssemblyRef =
    previous && isUnchanged
      ? {rkey: previous.rkey, createdAt: previous.createdAt, fingerprint}
      : {rkey: TID.nextStr(), createdAt: new Date().toISOString(), fingerprint}
  input.onRef(ref)

  const staleRkey =
    previous && !isUnchanged && !previous.conversationId
      ? previous.rkey
      : undefined
  const record = await writeRecord(agent, ref, topic, staleRkey)
  const body = JSON.stringify({
    topic,
    statements,
    conversation: {at_uri: record.uri, at_cid: record.cid},
  })

  let response = await requestCreate(agent, body)
  for (
    let retries = 0;
    retries < CREATE_RETRIES &&
    response.status === 503 &&
    response.data.error === RECORDS_INCOMPLETE;
    retries++
  ) {
    await pause(CREATE_RETRY_PAUSE_MS)
    response = await requestCreate(agent, body)
  }

  if (response.status === 200 || response.status === 201) {
    const {conversation_id, report_id, created} = response.data
    if (!isAssemblyConversationId(conversation_id)) {
      throw new AssemblyError('unavailable', 'create')
    }
    const createdRef = {
      ...ref,
      conversationId: conversation_id,
      ...(typeof report_id === 'string' && report_id
        ? {reportId: report_id}
        : {}),
    }
    input.onRef(createdRef)
    return {ref: createdRef, isReplay: created === false}
  }

  if (response.status === 429 && response.data.error === RATE_LIMITED) {
    throw new AssemblyError('busy', 'create')
  }

  const refusal = REFUSALS[response.status]
  if (refusal) {
    await removeRecord(agent, ref.rkey)
    if (refusal === 'conflict') {
      input.onRef({
        rkey: TID.nextStr(),
        createdAt: new Date().toISOString(),
        fingerprint,
      })
    }
    throw new AssemblyError(
      response.data.error === UNSUPPORTED_ACCOUNT ? 'not_eligible' : refusal,
      'create',
    )
  }
  throw new AssemblyError(
    response.status === 401 ? 'auth' : 'unavailable',
    'create',
  )
}
