import {useCallback} from 'react'
import {useNavigation} from '@react-navigation/native'

import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {type NavigationProp} from '#/lib/routes/types'
import {useExternalEmbedsPrefs} from '#/state/preferences'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {useAnalytics} from '#/analytics'
import {useActorStatus} from '#/features/liveNow'
import {parseStreamplaceActor} from '#/features/streamplace/url'
import {inLiveWindow, isLiveOnStreamplace} from './live'
import {type ParsedEvent} from './record'

export function useEventLive(parsed: ParsedEvent): boolean {
  const actor =
    parsed.streamplaceUrl &&
    !parsed.cancelled &&
    inLiveWindow(parsed, new Date())
      ? parseStreamplaceActor(parsed.streamplaceUrl)
      : undefined
  const {data: streamer} = useProfileQuery({did: actor})
  const status = useActorStatus(streamer)
  return streamer ? isLiveOnStreamplace(status, streamer) : false
}

export function useWatchStreamplace() {
  const ax = useAnalytics()
  const {hasSession} = useSession()
  const navigation = useNavigation<NavigationProp>()
  const openLink = useOpenLink()
  const embedsHidden = useExternalEmbedsPrefs()?.streamplace === 'hide'
  return useCallback(
    (url: string) => {
      const actor =
        hasSession &&
        !embedsHidden &&
        ax.features.enabled(ax.features.StreamplaceWatchEnable)
          ? parseStreamplaceActor(url)
          : undefined
      if (actor) {
        navigation.push('StreamplaceWatch', {actor})
      } else {
        void openLink(url)
      }
    },
    [ax, embedsHidden, hasSession, navigation, openLink],
  )
}
