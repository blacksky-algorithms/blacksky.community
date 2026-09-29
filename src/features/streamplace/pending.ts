export type PendingMessage = {
  localId: string
  text: string
  sentAt: number
  uri?: string
  status: 'sending' | 'failed'
}

export function reconcilePending(
  pending: PendingMessage[],
  seenUris: ReadonlySet<string>,
  now: number,
  timeoutMs: number,
): PendingMessage[] {
  let changed = false
  const next: PendingMessage[] = []
  for (const m of pending) {
    if (m.uri && seenUris.has(m.uri)) {
      changed = true
      continue
    }
    if (m.status === 'sending' && m.uri && now - m.sentAt > timeoutMs) {
      changed = true
      next.push({...m, status: 'failed'})
      continue
    }
    next.push(m)
  }
  return changed ? next : pending
}
