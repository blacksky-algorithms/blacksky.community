import {View} from 'react-native'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {AvatarStack} from '#/components/AvatarStack'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {Pin_Stroke2_Corner0_Rounded as PinIcon} from '#/components/icons/Pin'
import {Text} from '#/components/Typography'
import {formatEventTime} from '../format'
import {type ParsedEvent} from '../record'
import {type EventView} from '../types'

export function EventMeta({
  event,
  parsed,
}: {
  event: EventView
  parsed: ParsedEvent
}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const time = formatEventTime(parsed, i18n.locale)
  const place =
    parsed.location ??
    (parsed.mode === 'virtual' || parsed.streamplaceUrl
      ? _(msg`Online`)
      : undefined)
  const knownGoing = event.knownGoing ?? []

  return (
    <View style={[a.gap_xs]}>
      {time && (
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <ClockIcon size="sm" style={[t.atoms.text_contrast_medium]} />
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.flex_1]}>
            {time.primary}
            {time.local ? ` · ${_(msg`${time.local} your time`)}` : ''}
          </Text>
        </View>
      )}
      {place && (
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          {parsed.location ? (
            <PinIcon size="sm" style={[t.atoms.text_contrast_medium]} />
          ) : (
            <GlobeIcon size="sm" style={[t.atoms.text_contrast_medium]} />
          )}
          <Text
            numberOfLines={1}
            style={[a.text_sm, t.atoms.text_contrast_medium, a.flex_1]}>
            {place}
          </Text>
        </View>
      )}
      <View style={[a.flex_row, a.align_center, a.gap_sm, a.pt_2xs]}>
        {knownGoing.length > 0 && (
          <AvatarStack profiles={knownGoing} size={20} />
        )}
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {event.interestedCount > 0 ? (
            <Trans>
              {plural(event.goingCount, {one: '# going', other: '# going'})} ·{' '}
              {plural(event.interestedCount, {
                one: '# interested',
                other: '# interested',
              })}
            </Trans>
          ) : (
            plural(event.goingCount, {one: '# going', other: '# going'})
          )}
        </Text>
      </View>
    </View>
  )
}
