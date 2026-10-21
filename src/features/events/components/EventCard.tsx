import {useMemo} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {AtUri} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {LinearGradientBackground} from '#/components/LinearGradientBackground'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {eventLinkLabel, type EventPhase, eventPhase} from '../format'
import {eventPoster} from '../poster'
import {useEventQuery} from '../queries'
import {coverUrl, parseEventRecord} from '../record'
import {type EventView} from '../types'
import {makeEventLink} from '../url'
import {EventMeta} from './EventMeta'
import {RsvpButtons} from './RsvpButtons'

export function EventCard({
  event: initial,
  badge,
  showPhase,
  showRsvp = true,
}: {
  event: EventView
  badge?: string
  showPhase?: boolean
  showRsvp?: boolean
}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const {data} = useEventQuery(initial.uri, initial)
  const event = data ?? initial
  const parsed = useMemo(() => parseEventRecord(event.record), [event.record])
  if (!parsed) return null
  const phase = eventPhase(parsed, new Date())
  const cover = coverUrl(event)
  const poster = eventPoster(event.uri, parsed)
  const href = makeEventLink(event.creator, new AtUri(event.uri).rkey)

  return (
    <View
      style={[
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        a.overflow_hidden,
      ]}>
      <Link to={href} label={eventLinkLabel(i18n, event, parsed, phase)}>
        <View style={[a.flex_row, a.gap_md, a.p_md, a.flex_1]}>
          {cover ? (
            <Image
              source={{uri: cover}}
              alt={_(msg`Cover image for ${parsed.name}`)}
              accessibilityIgnoresInvertColors
              style={[a.rounded_sm, {width: 64, height: 64}]}
            />
          ) : (
            <LinearGradientBackground
              gradient={poster.gradient}
              style={[
                a.rounded_sm,
                a.align_center,
                a.justify_center,
                {width: 64, height: 64},
              ]}>
              <Text style={{fontSize: 30}}>{poster.emoji}</Text>
            </LinearGradientBackground>
          )}
          <View style={[a.flex_1, a.gap_xs]}>
            {(badge || parsed.cancelled || (showPhase && phase)) && (
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                {showPhase && phase && !parsed.cancelled && (
                  <PhasePill phase={phase} />
                )}
                {(badge || parsed.cancelled) && (
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      parsed.cancelled
                        ? {color: t.palette.negative_500}
                        : t.atoms.text_contrast_medium,
                    ]}>
                    {parsed.cancelled ? <Trans>Cancelled</Trans> : badge}
                  </Text>
                )}
              </View>
            )}
            <Text
              numberOfLines={2}
              style={[a.text_md, a.font_bold, a.leading_snug]}>
              {parsed.name}
            </Text>
            <EventMeta event={event} parsed={parsed} />
          </View>
        </View>
      </Link>
      {showRsvp && !parsed.cancelled && phase !== 'past' && (
        <View style={[a.px_md, a.pb_md]}>
          <RsvpButtons event={event} />
        </View>
      )}
    </View>
  )
}

function PhasePill({phase}: {phase: EventPhase}) {
  const t = useTheme()
  const current = phase === 'current'
  return (
    <View
      style={[
        a.rounded_full,
        a.px_sm,
        {paddingVertical: 2},
        current
          ? {backgroundColor: t.palette.primary_500}
          : t.atoms.bg_contrast_50,
      ]}>
      <Text
        style={[
          a.text_xs,
          a.font_bold,
          current ? {color: t.palette.white} : t.atoms.text_contrast_medium,
        ]}>
        {phase === 'upcoming' ? (
          <Trans>Upcoming</Trans>
        ) : current ? (
          <Trans>Happening now</Trans>
        ) : (
          <Trans>Past</Trans>
        )}
      </Text>
    </View>
  )
}
