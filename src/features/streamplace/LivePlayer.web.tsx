import {useCallback, useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'

import {atoms as a} from '#/alf'
import {LiveOffline} from './LiveOffline'
import {livePlaylistUrl} from './url'

const RETRY_MS = 2000
const OFFLINE_AFTER_MS = 10_000
const MAX_MEDIA_RECOVERIES = 2

export function LivePlayer({actor}: {actor: string}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useFocusEffect(
    useCallback(() => {
      const video = ref.current
      if (video?.paused) void video.play().catch(() => undefined)
      return () => video?.pause()
    }, []),
  )

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const src = livePlaylistUrl(actor)
    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    let offlineTimer: ReturnType<typeof setTimeout> | undefined
    let hls: {destroy: () => void} | undefined
    let mediaRecoveries = 0
    setOffline(false)

    const onFailure = (reload: () => void) => {
      if (!offlineTimer) {
        offlineTimer = setTimeout(() => setOffline(true), OFFLINE_AFTER_MS)
      }
      clearTimeout(retry)
      retry = setTimeout(() => {
        if (!disposed) reload()
      }, RETRY_MS)
    }
    const onPlaying = () => {
      mediaRecoveries = 0
      clearTimeout(offlineTimer)
      offlineTimer = undefined
      setOffline(false)
    }
    video.addEventListener('playing', onPlaying)

    void import('hls.js')
      .then(({default: Hls}) => {
        if (disposed) return
        if (Hls.isSupported()) {
          const instance = new Hls({
            liveDurationInfinity: true,
            backBufferLength: 10,
          })
          instance.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return
            if (
              data.type === Hls.ErrorTypes.MEDIA_ERROR &&
              mediaRecoveries++ < MAX_MEDIA_RECOVERIES
            ) {
              instance.recoverMediaError()
              return
            }
            onFailure(() => {
              instance.loadSource(src)
              instance.startLoad()
            })
          })
          instance.attachMedia(video)
          instance.loadSource(src)
          hls = instance
        } else {
          const load = () => {
            video.src = src
            video.load()
            void video.play().catch(() => undefined)
          }
          video.onerror = () => onFailure(load)
          load()
        }
      })
      .catch(() => {
        if (!disposed) setOffline(true)
      })

    return () => {
      disposed = true
      clearTimeout(retry)
      clearTimeout(offlineTimer)
      video.removeEventListener('playing', onPlaying)
      video.onerror = null
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
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
      {offline && <LiveOffline onRetry={() => setAttempt(n => n + 1)} />}
    </View>
  )
}
