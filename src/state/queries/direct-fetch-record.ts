/* eslint-disable @typescript-eslint/no-explicit-any */

type ProfileViewBasic = app.bsky.actor.defs.ProfileViewBasic
import {type Client} from '@atproto/lex'
import {AtUri} from '@atproto/syntax'
import {app, com} from '#/lexicons'
import {useQuery} from '@tanstack/react-query'

import {retry} from '#/lib/async/retry'
import {STALE} from '#/state/queries'
import {useAppviewClient} from '#/state/session'
import * as bsky from '#/types/bsky'

const RQKEY_ROOT = 'direct-fetch-record'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]

export async function directFetchRecordAndProfile(client: Client, uri: string) {
  const urip = new AtUri(uri)

  if (!urip.host.startsWith('did:')) {
    const res = await client.call(com.atproto.identity.resolveHandle, {
      handle: urip.host,
    })
    ;(urip as any).host = res.data.did
  }

  try {
    const [profile, record] = await Promise.all([
      (async () =>
        (await client.call(app.bsky.actor.getProfile, {actor: urip.host}))
          .data)(),
      (async () =>
        (
          await retry(
            2,
            e => {
              if (e.message.includes(`Could not locate record:`)) {
                return false
              }
              return true
            },
            () =>
              client.call(com.atproto.repo.getRecord, {
                repo: urip.host,
                collection: 'app.bsky.feed.post',
                rkey: urip.rkey,
              }),
          )
        ).data.value)(),
    ])

    return {profile, record}
  } catch (e) {
    console.error(e)
    return undefined
  }
}

export async function directFetchEmbedRecord(
  client: Client,
  uri: string,
): Promise<app.bsky.embed.record.ViewRecord | undefined> {
  const res = await directFetchRecordAndProfile(client, uri)
  if (res === undefined) return undefined
  const {profile, record} = res

  if (record && bsky.validate(record, app.bsky.feed.post.validateRecord)) {
    return {
      $type: 'app.bsky.embed.record#viewRecord',
      uri,
      author: profile as ProfileViewBasic,
      cid: 'directfetch',
      value: record,
      indexedAt: new Date().toISOString(),
    } satisfies app.bsky.embed.record.ViewRecord
  } else {
    return undefined
  }
}

export function useDirectFetchEmbedRecord({
  uri,
  enabled,
}: {
  uri: string
  enabled?: boolean
}) {
  const client = useAppviewClient()
  return useQuery<app.bsky.embed.record.ViewRecord | undefined>({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(uri || ''),
    async queryFn() {
      return directFetchEmbedRecord(client, uri)
    },
    enabled: enabled && !!uri,
  })
}

export async function directFetchPostRecord(
  client: Client,
  uri: string,
): Promise<app.bsky.feed.defs.PostView | undefined> {
  const res = await directFetchRecordAndProfile(client, uri)
  if (res === undefined) return undefined
  const {profile, record} = res

  if (record && bsky.validate(record, app.bsky.feed.post.validateRecord)) {
    return {
      $type: 'app.bsky.feed.defs#postView',
      uri,
      author: profile as ProfileViewBasic,
      cid: 'directfetch',
      record,
      indexedAt: new Date().toISOString(),
    } satisfies app.bsky.feed.defs.PostView
  } else {
    return undefined
  }
}

// based on https://stackoverflow.com/a/46432113
export class LRU<K, V> {
  max: number
  private cache: Map<K, Promise<V>>
  constructor(max = 1_024) {
    this.max = max
    this.cache = new Map()
  }

  get(key: K) {
    let item = this.cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key: K, val: Promise<V>) {
    // refresh key
    if (this.cache.has(key)) this.cache.delete(key)
    // evict oldest
    else if (this.cache.size >= this.max)
      this.cache.delete(this.nonemptyFirst())
    this.cache.set(key, val)
  }

  delete(key: K) {
    return this.cache.delete(key)
  }

  private nonemptyFirst() {
    return this.cache.keys().next().value!
  }

  async getOrInsertWith(key: K, fn: () => Promise<V>): Promise<V> {
    const val = this.get(key)
    if (val !== undefined) return val

    const promise = fn()
    this.set(key, promise)
    return promise
  }

  // try to insert, but remove from cache on error and bubble
  async getOrTryInsertWith(key: K, fn: () => Promise<V>): Promise<V> {
    const val = this.get(key)
    if (val !== undefined) return val

    const promise = fn()
    this.set(key, promise)
    try {
      return await promise
    } catch (e) {
      this.delete(key)
      throw e
    }
  }
}
