import {useEffect, useRef, useState} from 'react'
import {type AppBskyActorDefs} from '@atproto/api'

import {useAgent} from '#/state/session'

const BATCH = 25

export function useChatProfiles(dids: string[]) {
  const agent = useAgent()
  const requested = useRef(new Set<string>())
  const [profiles, setProfiles] = useState<
    ReadonlyMap<string, AppBskyActorDefs.ProfileViewDetailed>
  >(new Map())

  useEffect(() => {
    const missing = [...new Set(dids)].filter(d => !requested.current.has(d))
    if (!missing.length) return
    missing.forEach(d => requested.current.add(d))
    void (async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        const chunk = missing.slice(i, i + BATCH)
        try {
          const res = await agent.getProfiles({actors: chunk})
          setProfiles(prev => {
            const next = new Map(prev)
            for (const p of res.data.profiles) next.set(p.did, p)
            return next
          })
        } catch {
          chunk.forEach(d => requested.current.delete(d))
        }
      }
    })()
  }, [dids, agent])

  return profiles
}
