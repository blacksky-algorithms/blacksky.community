import {View} from 'react-native'
import {useEvent} from 'expo'
import {useVideoPlayer, VideoView} from 'expo-video'

import {atoms as a} from '#/alf'
import {LiveOffline} from './LiveOffline'
import {livePlaylistUrl} from './url'

export function LivePlayer({actor}: {actor: string}) {
  const source = livePlaylistUrl(actor)
  const player = useVideoPlayer(source, p => {
    p.play()
  })
  const {status} = useEvent(player, 'statusChange', {status: player.status})

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
      {status === 'error' && (
        <LiveOffline
          onRetry={() => {
            player.replace(source)
            player.play()
          }}
        />
      )}
    </View>
  )
}
