import {useEffect, useRef, useState} from 'react'
import {type DidString} from '@atproto/syntax'

import {useAppviewClient} from '#/state/session'
import {app} from '#/lexicons'

const BATCH = 25

export function useChatProfiles(dids: string[]) {
  const client = useAppviewClient()
  const requested = useRef(new Set<string>())
  const [profiles, setProfiles] = useState<
    ReadonlyMap<string, app.bsky.actor.defs.ProfileViewDetailed>
  >(new Map())

  useEffect(() => {
    const missing = [...new Set(dids)].filter(d => !requested.current.has(d))
    if (!missing.length) return
    missing.forEach(d => requested.current.add(d))
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH)
      client
        .call(app.bsky.actor.getProfiles, {actors: chunk as DidString[]})
        .then(res => {
          setProfiles(prev => {
            const next = new Map(prev)
            for (const p of res.profiles) next.set(p.did, p)
            return next
          })
        })
        .catch(() => {
          chunk.forEach(d => requested.current.delete(d))
        })
    }
  }, [dids, client])

  return profiles
}
