import {useMemo} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyEmbedExternal} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {toNiceDomain} from '#/lib/strings/url-helpers'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {LinearGradientBackground} from '#/components/LinearGradientBackground'
import {Link} from '#/components/Link'
import {ExternalEmbed} from '#/components/Post/Embed/ExternalEmbed'
import {Text} from '#/components/Typography'
import {eventPhase} from '../format'
import {eventPoster} from '../poster'
import {useEventQuery} from '../queries'
import {coverUrl, parseEventRecord} from '../record'
import {eventAtUri, type EventRef, makeEventLink} from '../url'
import {EventMeta} from './EventMeta'
import {RsvpButtons} from './RsvpButtons'

export function EventEmbed({
  eventRef,
  link,
  onOpen,
  style,
}: {
  eventRef: EventRef
  link: AppBskyEmbedExternal.ViewExternal
  onOpen?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const {_} = useLingui()
  const openLink = useOpenLink()
  const {data: did} = useResolveDidQuery(eventRef.actor)
  const {data: event} = useEventQuery(
    did ? eventAtUri(did, eventRef.rkey) : undefined,
  )
  const parsed = useMemo(
    () => (event ? parseEventRecord(event.record) : undefined),
    [event],
  )

  if (!event || !parsed) {
    return <ExternalEmbed link={link} onOpen={onOpen} style={style} />
  }

  const phase = eventPhase(parsed, new Date())
  const cover = coverUrl(event)
  const poster = eventPoster(event.uri, parsed)
  return (
    <View
      style={[
        a.rounded_md,
        a.border,
        a.overflow_hidden,
        t.atoms.border_contrast_low,
        style,
      ]}>
      <Link
        to={makeEventLink(event.creator, eventRef.rkey)}
        label={_(msg`View event ${parsed.name}`)}
        onPress={onOpen}>
        <View style={[a.w_full]}>
          {cover ? (
            <Image
              source={{uri: cover}}
              accessibilityIgnoresInvertColors
              style={[a.w_full, {aspectRatio: 2}]}
              contentFit="cover"
            />
          ) : (
            <LinearGradientBackground
              gradient={poster.gradient}
              style={[
                a.w_full,
                a.align_center,
                a.justify_center,
                {aspectRatio: 3},
              ]}>
              <Text style={{fontSize: 48}}>{poster.emoji}</Text>
            </LinearGradientBackground>
          )}
          <View style={[a.p_md, a.gap_xs]}>
            {(parsed.cancelled || phase === 'current') && (
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {
                    color: parsed.cancelled
                      ? t.palette.negative_500
                      : t.palette.primary_500,
                  },
                ]}>
                {parsed.cancelled ? (
                  <Trans>Cancelled</Trans>
                ) : (
                  <Trans>Happening now</Trans>
                )}
              </Text>
            )}
            <Text
              numberOfLines={2}
              style={[a.text_lg, a.font_bold, a.leading_snug]}>
              {parsed.name}
            </Text>
            <EventMeta event={event} parsed={parsed} />
          </View>
        </View>
      </Link>
      {!parsed.cancelled && phase !== 'past' && (
        <View style={[a.px_md, a.pb_md, a.gap_sm]}>
          {parsed.joinUrl && (
            <Button
              label={_(msg`Join online at ${toNiceDomain(parsed.joinUrl)}`)}
              size="small"
              color={phase === 'current' ? 'primary' : 'secondary'}
              onPress={() => openLink(parsed.joinUrl!)}>
              <ButtonText>
                <Trans>Join · {toNiceDomain(parsed.joinUrl)}</Trans>
              </ButtonText>
            </Button>
          )}
          <RsvpButtons event={event} />
        </View>
      )}
    </View>
  )
}
