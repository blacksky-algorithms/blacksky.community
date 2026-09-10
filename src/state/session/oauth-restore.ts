import {type OAuthSession} from '@atproto/oauth-client'

type OAuthRestoreClient = {
  restore(did: string): Promise<OAuthSession>
}

const pendingRestores = new Map<string, Promise<OAuthSession>>()

export function restoreOAuthSession(
  client: OAuthRestoreClient,
  did: string,
  timeoutMs: number,
): Promise<OAuthSession> {
  let pending = pendingRestores.get(did)
  if (!pending) {
    pending = client.restore(did)
    pendingRestores.set(did, pending)
    pending.then(
      () => {
        if (pendingRestores.get(did) === pending) pendingRestores.delete(did)
      },
      () => {
        if (pendingRestores.get(did) === pending) pendingRestores.delete(did)
      },
    )
  }

  return withTimeout(pending, timeoutMs)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('OAuth session restore timed out')),
      timeoutMs,
    )
    promise.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      err => {
        clearTimeout(timeout)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}
