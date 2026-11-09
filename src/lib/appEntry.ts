import {type Metrics} from '#/analytics'

type PendingAppEntry = Omit<Metrics['app:entry'], 'coldStart'>

let pending: PendingAppEntry | undefined

export function setPendingAppEntry(entry: PendingAppEntry) {
  pending = entry
}

export function takePendingAppEntry() {
  const entry = pending
  pending = undefined
  return entry
}
