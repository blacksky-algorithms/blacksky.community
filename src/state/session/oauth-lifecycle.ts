export type OauthLifecycleEvent = {
  type: 'deleted'
  did: string
}

export type OauthLifecycleSink = (event: OauthLifecycleEvent) => void

let sink: OauthLifecycleSink | null = null
const pending: OauthLifecycleEvent[] = []

export function setOauthLifecycleSink(next: OauthLifecycleSink | null) {
  sink = next
  if (sink && pending.length) {
    const drained = pending.splice(0, pending.length)
    for (const event of drained) sink(event)
  }
}

export function emitOauthLifecycleEvent(event: OauthLifecycleEvent) {
  if (sink) {
    sink(event)
  } else {
    pending.push(event)
    if (pending.length > 50) pending.shift()
  }
}
