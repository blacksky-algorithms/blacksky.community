import {useEffect, useReducer, useState} from 'react'

import {logger} from '#/logger'
import {
  EMPTY_LIVE_STATE,
  isLiveAt,
  type LiveState,
  reduceLiveEvent,
} from './live-state'
import {liveSocketUrl} from './url'

type Action = {raw: unknown; now: number}

const reducer = (s: LiveState, a: Action) => reduceLiveEvent(s, a.raw, a.now)

export function useStreamplaceLive(actor: string | undefined) {
  const [state, dispatch] = useReducer(reducer, EMPTY_LIVE_STATE)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!actor) return
    let ws: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let disposed = false

    const connect = () => {
      ws = new WebSocket(liveSocketUrl(actor))
      ws.onopen = () => {
        attempt = 0
      }
      ws.onmessage = e => {
        try {
          dispatch({raw: JSON.parse(String(e.data)), now: Date.now()})
        } catch (err) {
          logger.warn('streamplace: unparseable websocket frame', {
            safeMessage: err,
          })
        }
      }
      ws.onclose = () => {
        if (disposed) return
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10_000))
      }
    }
    connect()
    return () => {
      disposed = true
      clearTimeout(retry)
      ws?.close()
    }
  }, [actor])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  return {...state, isLive: isLiveAt(state, now)}
}
