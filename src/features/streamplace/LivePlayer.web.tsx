import {useEffect, useRef, useState} from 'react'
import {View} from 'react-native'

import {atoms as a} from '#/alf'
import {LiveOffline} from './LiveOffline'
import {livePlaylistUrl} from './url'

export function LivePlayer({actor}: {actor: string}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const src = livePlaylistUrl(actor)
    setError(false)

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.onerror = () => setError(true)
      void video.play().catch(() => undefined)
      return () => {
        video.removeAttribute('src')
        video.load()
      }
    }

    let hls: {destroy: () => void} | undefined
    let cancelled = false
    void import('hls.js').then(({default: Hls}) => {
      if (cancelled) return
      const instance = new Hls()
      instance.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError(true)
      })
      instance.attachMedia(video)
      instance.loadSource(src)
      hls = instance
    })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [actor, attempt])

  return (
    <View style={[a.w_full, {aspectRatio: 16 / 9, backgroundColor: 'black'}]}>
      <video
        ref={ref}
        controls
        autoPlay
        muted
        playsInline
        style={{width: '100%', height: '100%', backgroundColor: 'black'}}
      />
      {error && <LiveOffline onRetry={() => setAttempt(n => n + 1)} />}
    </View>
  )
}
