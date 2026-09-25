import {useCallback, useEffect, useMemo, useState} from 'react'

import {logger} from '#/logger'
import {useAgent} from '#/state/session'
import {type ChatMessage} from './live-state'
import {type PendingMessage, reconcilePending} from './pending'

const COLLECTION = 'place.stream.chat.message'
export const CHAT_DELIVERY_TIMEOUT_MS = 10_000

export function useSendChat(streamerDid: string | undefined, messages: ChatMessage[]) {
  const agent = useAgent()
  const [pending, setPending] = useState<PendingMessage[]>([])
  const seenUris = useMemo(() => new Set(messages.map(m => m.uri)), [messages])

  useEffect(() => {
    setPending(prev => reconcilePending(prev, seenUris, Date.now(), CHAT_DELIVERY_TIMEOUT_MS))
    const id = setInterval(
      () =>
        setPending(prev => reconcilePending(prev, seenUris, Date.now(), CHAT_DELIVERY_TIMEOUT_MS)),
      2000,
    )
    return () => clearInterval(id)
  }, [seenUris])

  const send = useCallback(
    async (text: string, replacing?: PendingMessage) => {
      if (!streamerDid || !agent.session) return
      const localId = `${Date.now()}-${Math.random()}`
      setPending(prev => [
        ...prev.filter(m => m.localId !== replacing?.localId),
        {localId, text, sentAt: Date.now(), status: 'sending'},
      ])
      try {
        if (replacing?.uri) {
          const rkey = replacing.uri.split('/').pop()!
          await agent.com.atproto.repo
            .deleteRecord({repo: agent.assertDid, collection: COLLECTION, rkey})
            .catch(() => undefined)
        }
        const res = await agent.com.atproto.repo.createRecord({
          repo: agent.assertDid,
          collection: COLLECTION,
          record: {
            $type: COLLECTION,
            text,
            streamer: streamerDid,
            createdAt: new Date().toISOString(),
          },
        })
        setPending(prev =>
          prev.map(m => (m.localId === localId ? {...m, uri: res.data.uri} : m)),
        )
      } catch (err) {
        logger.warn('streamplace: chat send failed', {safeMessage: err})
        setPending(prev =>
          prev.map(m => (m.localId === localId ? {...m, status: 'failed'} : m)),
        )
      }
    },
    [agent, streamerDid],
  )

  return {pending, send}
}
