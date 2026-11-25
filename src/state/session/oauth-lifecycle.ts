export type OauthLifecycleEvent = {
  type: 'deleted' | 'superseded'
  did: string
}

export type OauthLifecycleSink = (event: OauthLifecycleEvent) => void

let sink: OauthLifecycleSink | null = null

export function setOauthLifecycleSink(next: OauthLifecycleSink | null) {
  sink = next
}

export function emitOauthLifecycleEvent(event: OauthLifecycleEvent) {
  sink?.(event)
}
