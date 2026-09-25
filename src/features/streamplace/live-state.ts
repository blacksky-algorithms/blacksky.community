export type ChatMessage = {
  uri: string
  authorDid: string
  handle: string
  text: string
  createdAt: string
}

export type LiveState = {
  title?: string
  endedAt?: string
  viewerCount?: number
  lastSegmentAt?: number
  messages: ChatMessage[]
  blockedDids: ReadonlySet<string>
}

export const EMPTY_LIVE_STATE: LiveState = {messages: [], blockedDids: new Set()}

const MAX_MESSAGES = 200
const SEGMENT_STALE_MS = 10_000

type Raw = Record<string, any>

export function reduceLiveEvent(state: LiveState, raw: unknown, now: number): LiveState {
  if (!raw || typeof raw !== 'object') return state
  const e = raw as Raw
  switch (e.$type) {
    case 'place.stream.chat.defs#messageView':
      return onMessage(state, e)
    case 'place.stream.chat.gate':
      return typeof e.hiddenMessage === 'string'
        ? withMessages(state, state.messages.filter(m => m.uri !== e.hiddenMessage))
        : state
    case 'place.stream.defs#blockView': {
      const did = e.record?.subject
      if (typeof did !== 'string') return state
      const blockedDids = new Set(state.blockedDids).add(did)
      return {
        ...state,
        blockedDids,
        messages: state.messages.filter(m => m.authorDid !== did),
      }
    }
    case 'place.stream.livestream#livestreamView':
      return {
        ...state,
        title: typeof e.record?.title === 'string' ? e.record.title : state.title,
        endedAt: typeof e.record?.endedAt === 'string' ? e.record.endedAt : undefined,
        viewerCount:
          typeof e.viewerCount?.count === 'number' ? e.viewerCount.count : state.viewerCount,
      }
    case 'place.stream.livestream#viewerCount':
      return typeof e.count === 'number' ? {...state, viewerCount: e.count} : state
    case 'place.stream.segment':
      return {...state, lastSegmentAt: now}
    default:
      return state
  }
}

export function isLiveAt(state: LiveState, now: number) {
  return (
    !state.endedAt &&
    state.lastSegmentAt !== undefined &&
    now - state.lastSegmentAt < SEGMENT_STALE_MS
  )
}

function onMessage(state: LiveState, e: Raw): LiveState {
  if (typeof e.uri !== 'string') return state
  if (e.deleted) {
    return withMessages(state, state.messages.filter(m => m.uri !== e.uri))
  }
  const authorDid = e.author?.did
  const text = e.record?.text
  if (typeof authorDid !== 'string' || typeof text !== 'string') return state
  if (state.blockedDids.has(authorDid)) return state
  if (state.messages.some(m => m.uri === e.uri)) return state
  const message: ChatMessage = {
    uri: e.uri,
    authorDid,
    handle: typeof e.author?.handle === 'string' ? e.author.handle : authorDid,
    text,
    createdAt:
      typeof e.record?.createdAt === 'string' ? e.record.createdAt : String(e.indexedAt ?? ''),
  }
  const messages = [...state.messages, message].sort((x, y) =>
    x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0,
  )
  return withMessages(state, messages.slice(-MAX_MESSAGES))
}

function withMessages(state: LiveState, messages: ChatMessage[]): LiveState {
  return messages.length === state.messages.length &&
    messages.every((m, i) => m === state.messages[i])
    ? state
    : {...state, messages}
}
