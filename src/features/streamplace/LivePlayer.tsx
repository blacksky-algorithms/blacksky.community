import {useCallback, useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {useVideoPlayer, VideoView} from 'expo-video'
import {useFocusEffect} from '@react-navigation/native'

import {atoms as a} from '#/alf'
import {LiveOffline} from './LiveOffline'
import {livePlaylistUrl} from './url'

const RETRY_MS = 2000
const OFFLINE_AFTER_MS = 10_000

export function LivePlayer({actor}: {actor: string}) {
  const source = livePlaylistUrl(actor)
  const player = useVideoPlayer(source, p => {
    p.play()
  })
  const failingSince = useRef<number | null>(null)
  const [offline, setOffline] = useState(false)

  const reload = () => {
    failingSince.current = null
    player.replace(source)
    player.play()
  }

  useFocusEffect(
    useCallback(() => {
      player.play()
      return () => player.pause()
    }, [player]),
  )

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined
    const sub = player.addListener('statusChange', ({status}) => {
      if (status === 'readyToPlay') {
        failingSince.current = null
        setOffline(false)
        return
      }
      if (status !== 'error') return
      if (failingSince.current === null) failingSince.current = Date.now()
      setOffline(Date.now() - failingSince.current > OFFLINE_AFTER_MS)
      clearTimeout(retry)
      retry = setTimeout(() => {
        player.replace(source)
        player.play()
      }, RETRY_MS)
    })
    return () => {
      sub.remove()
      clearTimeout(retry)
    }
  }, [player, source])

  return (
    <View style={[a.w_full, {aspectRatio: 16 / 9, backgroundColor: 'black'}]}>
      <VideoView
        player={player}
        style={a.flex_1}
        nativeControls
        fullscreenOptions={{enable: true, orientation: 'landscape'}}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      {offline && <LiveOffline onRetry={reload} />}
    </View>
  )
}
