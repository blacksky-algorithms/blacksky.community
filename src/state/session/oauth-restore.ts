import {type OAuthSession} from '@atproto/oauth-client'

type OAuthRestoreClient = {
  restore(did: string, refresh?: boolean): Promise<OAuthSession>
}

const pendingRestores = new Map<string, Promise<OAuthSession>>()

export function restoreOAuthSession(
  client: OAuthRestoreClient,
  did: string,
  timeoutMs: number,
  refresh?: boolean,
): Promise<OAuthSession> {
  const key = refresh === undefined ? did : `${did}:${refresh}`
  let pending = pendingRestores.get(key)
  if (!pending) {
    pending = client.restore(did, refresh)
    pendingRestores.set(key, pending)
    pending.then(
      () => {
        if (pendingRestores.get(key) === pending) pendingRestores.delete(key)
      },
      () => {
        if (pendingRestores.get(key) === pending) pendingRestores.delete(key)
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
