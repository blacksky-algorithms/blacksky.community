import {ComAtprotoRepoPutRecord} from '@atproto/api'
import {retry} from '@atproto/common-web'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useMutation} from '@tanstack/react-query'

import {useAgent, useSession} from '#/state/session'
import * as Toast from '#/view/com/util/Toast'

const COLLECTION = 'community.blacksky.actor.flair'

export function useUpsertFlairMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const {_} = useLingui()

  return useMutation({
    mutationFn: async (decoration: string) => {
      if (!currentAccount) throw new Error('Not logged in')

      const record = {
        $type: COLLECTION,
        decoration,
        createdAt: new Date().toISOString(),
      }

      const upsert = async () => {
        const repo = currentAccount.did
        const existing = await agent.com.atproto.repo
          .getRecord({repo, collection: COLLECTION, rkey: 'self'})
          .catch(_e => undefined)

        await agent.com.atproto.repo.putRecord({
          repo,
          collection: COLLECTION,
          rkey: 'self',
          record,
          swapRecord: existing?.data.cid || null,
        })
      }

      await retry(upsert, {
        maxRetries: 5,
        retryable: e => e instanceof ComAtprotoRepoPutRecord.InvalidSwapError,
      })

      return {record}
    },
    onError: () => {
      Toast.show(_(msg`Failed to update flair`))
    },
    onSuccess: () => {
      Toast.show(_(msg`Flair updated`))
      // Phase 2: add updateProfileShadow when AppView surfaces flair data
    },
  })
}

export function useRemoveFlairMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const {_} = useLingui()

  return useMutation({
    mutationFn: async () => {
      if (!currentAccount) throw new Error('Not logged in')

      await agent.com.atproto.repo.deleteRecord({
        repo: currentAccount.did,
        collection: COLLECTION,
        rkey: 'self',
      })
    },
    onError: () => {
      Toast.show(_(msg`Failed to remove flair`))
    },
    onSuccess: () => {
      Toast.show(_(msg`Flair removed`))
      // Phase 2: add updateProfileShadow when AppView surfaces flair data
    },
  })
}
