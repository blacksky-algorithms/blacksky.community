import {View} from 'react-native'
import {Image} from 'expo-image'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {toNiceDomain} from '#/lib/strings/url-helpers'
import {logger} from '#/logger'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useRequireAuth} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {AvatarStack} from '#/components/AvatarStack'
import {Button, ButtonText} from '#/components/Button'
import {LinearGradientBackground} from '#/components/LinearGradientBackground'
import {InlineLinkText} from '#/components/Link'
import * as ProfileCard from '#/components/ProfileCard'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {LiveWatchButton} from '#/features/events/components/LiveWatchButton'
import {
  eventDateParts,
  eventPhase,
  formatEventTime,
} from '#/features/events/format'
import {eventPoster} from '#/features/events/poster'
import {useRsvpMutation} from '#/features/events/queries'
import {coverUrl, type ParsedEvent} from '#/features/events/record'
import {
  type EventView,
  RSVP_GOING,
  RSVP_INTERESTED,
  RSVP_NOTGOING,
  type RsvpStatus,
  type RsvpView,
} from '#/features/events/types'
import {
  useEventLive,
  useWatchStreamplace,
} from '#/features/events/useStreamplace'

export function EventHeader({
  event,
  parsed,
  guests,
}: {
  event: EventView
  parsed: ParsedEvent
  guests: RsvpView[]
}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const openLink = useOpenLink()
  const watch = useWatchStreamplace()
  const live = useEventLive(parsed)
  const date = eventDateParts(parsed, i18n.locale)
  const localTime = formatEventTime(parsed, i18n.locale)?.local
  const past = eventPhase(parsed, new Date()) === 'past'
  const otherLinks = parsed.links.filter(
    link => link.uri !== parsed.joinUrl && link.uri !== parsed.streamplaceUrl,
  )
  const place =
    parsed.location ??
    (parsed.streamplaceUrl || parsed.mode === 'virtual'
      ? _(msg`Online`)
      : undefined)

  return (
    <View style={[a.pb_xl]}>
      <LinearGradientBackground
        gradient="primary"
        style={[a.absolute, a.inset_0, {height: 220, opacity: 0.35}]}
      />
      <View style={[a.align_center, a.px_lg, a.pt_2xl, a.gap_lg]}>
        {parsed.cancelled && (
          <View
            style={[
              a.rounded_full,
              a.px_md,
              a.py_xs,
              {backgroundColor: t.palette.negative_500},
            ]}>
            <Text style={[a.text_sm, a.font_bold, {color: t.palette.white}]}>
              <Trans>Cancelled</Trans>
            </Text>
          </View>
        )}
        <Poster event={event} parsed={parsed} />
        <Text
          style={[
            a.text_4xl,
            a.font_bold,
            a.text_center,
            a.leading_tight,
            {letterSpacing: -0.5},
          ]}>
          {parsed.name}
        </Text>
        {date && (
          <View style={[a.align_center, a.gap_2xs]}>
            <Text style={[a.text_lg, a.font_semi_bold, a.text_center]}>
              {date.longDate}
            </Text>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              {date.timeRange}
            </Text>
            {localTime && (
              <Text
                style={[a.text_sm, a.text_center, t.atoms.text_contrast_low]}>
                <Trans>{localTime} your time</Trans>
              </Text>
            )}
          </View>
        )}
        {place && (
          <View
            style={[
              a.flex_row,
              a.flex_wrap,
              a.align_center,
              a.justify_center,
              a.gap_sm,
            ]}>
            <Text
              style={[
                a.flex_shrink,
                a.text_md,
                a.text_center,
                t.atoms.text_contrast_medium,
              ]}>
              📍 {place}
            </Text>
            {live && <LiveWatchButton url={parsed.streamplaceUrl!} />}
          </View>
        )}
        {parsed.joinUrl && !parsed.cancelled && !past && (
          <Button
            label={_(msg`Join online at ${toNiceDomain(parsed.joinUrl)}`)}
            size="large"
            color="primary"
            onPress={() => openLink(parsed.joinUrl!)}>
            <ButtonText>
              <Trans>Join · {toNiceDomain(parsed.joinUrl)}</Trans>
            </ButtonText>
          </Button>
        )}
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <UserAvatar avatar={event.creator.avatar} size={28} type="user" />
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>
              Hosted by{' '}
              <InlineLinkText
                label={_(msg`View host's profile`)}
                to={`/profile/${event.creator.handle || event.creator.did}`}
                style={[a.text_md, a.font_semi_bold]}>
                {event.creator.displayName || `@${event.creator.handle}`}
              </InlineLinkText>
            </Trans>
          </Text>
        </View>
        {parsed.streamplaceUrl && !live && (
          <Button
            label={_(msg`Watch on Streamplace`)}
            size="small"
            color="secondary"
            onPress={() => watch(parsed.streamplaceUrl!)}>
            <ButtonText>
              <Trans>📺 Watch on Streamplace</Trans>
            </ButtonText>
          </Button>
        )}
        {!parsed.cancelled && !past && <RsvpChoices event={event} />}
        <Guests event={event} guests={guests} />
      </View>
      {parsed.description && (
        <View
          style={[
            a.mx_lg,
            a.mt_xl,
            a.p_lg,
            a.rounded_lg,
            a.gap_sm,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_md, a.font_bold]}>
            <Trans>About</Trans>
          </Text>
          <Text style={[a.text_md, a.leading_snug]}>{parsed.description}</Text>
        </View>
      )}
      {otherLinks.length > 0 && (
        <View
          style={[
            a.mx_lg,
            a.mt_md,
            a.p_lg,
            a.rounded_lg,
            a.gap_sm,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_md, a.font_bold]}>
            <Trans>Links</Trans>
          </Text>
          {otherLinks.map(link => (
            <InlineLinkText
              key={link.uri}
              label={link.name || link.uri}
              to={link.uri}
              style={[a.text_md]}>
              {link.name || toNiceDomain(link.uri)}
            </InlineLinkText>
          ))}
        </View>
      )}
      <Text style={[a.px_lg, a.pt_xl, a.text_lg, a.font_bold]}>
        <Trans>Guest list</Trans>
      </Text>
    </View>
  )
}

function Poster({event, parsed}: {event: EventView; parsed: ParsedEvent}) {
  const size = 280
  const cover = coverUrl(event)
  if (cover) {
    return (
      <Image
        source={{uri: cover}}
        accessibilityIgnoresInvertColors
        style={[a.rounded_lg, {width: size, height: size}]}
        contentFit="cover"
      />
    )
  }
  const poster = eventPoster(event.uri, parsed)
  return (
    <LinearGradientBackground
      gradient={poster.gradient}
      style={[
        a.rounded_lg,
        a.align_center,
        a.justify_center,
        {width: size, height: size},
      ]}>
      <Text style={{fontSize: 96}}>{poster.emoji}</Text>
    </LinearGradientBackground>
  )
}

function RsvpChoices({event}: {event: EventView}) {
  const t = useTheme()
  const {_} = useLingui()
  const requireAuth = useRequireAuth()
  const {mutate, isPending} = useRsvpMutation(event)
  const current = event.viewer?.rsvp?.status
  const choices: {
    status: RsvpStatus
    emoji: string
    label: string
    removeLabel: string
  }[] = [
    {
      status: RSVP_GOING,
      emoji: '👍',
      label: _(msg`Going`),
      removeLabel: _(msg`Going, tap to remove`),
    },
    {
      status: RSVP_INTERESTED,
      emoji: '🤔',
      label: _(msg`Interested`),
      removeLabel: _(msg`Interested, tap to remove`),
    },
    {
      status: RSVP_NOTGOING,
      emoji: '😢',
      label: _(msg`Not going`),
      removeLabel: _(msg`Not going, tap to remove`),
    },
  ]
  const onPress = (status: RsvpStatus) =>
    requireAuth(() =>
      mutate(
        {status, current: event.viewer?.rsvp},
        {
          onError: error => {
            logger.error('Failed to update RSVP', {safeMessage: error})
            Toast.show(_(msg`Couldn't update your RSVP`), {type: 'error'})
          },
        },
      ),
    )

  return (
    <View style={[a.flex_row, a.gap_sm, a.w_full, {maxWidth: 420}]}>
      {choices.map(choice => {
        const selected = current === choice.status
        return (
          <Button
            key={choice.status}
            label={selected ? choice.removeLabel : choice.label}
            size="large"
            color={selected ? 'primary' : 'secondary'}
            disabled={isPending}
            style={[a.flex_1, a.flex_col, a.gap_2xs, a.py_md]}
            onPress={() => onPress(choice.status)}>
            <Text style={[a.text_2xl]}>{choice.emoji}</Text>
            <Text
              style={[
                a.text_sm,
                a.font_semi_bold,
                selected ? {color: t.palette.white} : t.atoms.text,
              ]}>
              {choice.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}

function Guests({event, guests}: {event: EventView; guests: RsvpView[]}) {
  const t = useTheme()
  if (event.goingCount + event.interestedCount === 0) return null
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      {guests.length > 0 && (
        <AvatarStack
          profiles={guests.slice(0, 5).map(guest => guest.actor)}
          size={28}
        />
      )}
      <Text style={[a.text_md, a.font_semi_bold, t.atoms.text_contrast_high]}>
        {plural(event.goingCount, {one: '# going', other: '# going'})}
        {event.interestedCount > 0
          ? ` · ${plural(event.interestedCount, {
              one: '# interested',
              other: '# interested',
            })}`
          : ''}
      </Text>
    </View>
  )
}

export function GuestRow({
  rsvp,
  noBorder,
}: {
  rsvp: RsvpView
  noBorder?: boolean
}) {
  const t = useTheme()
  const {_} = useLingui()
  const moderationOpts = useModerationOpts()
  if (!moderationOpts) return null
  const response =
    rsvp.status === RSVP_GOING
      ? {emoji: '👍', label: _(msg`Going`)}
      : rsvp.status === RSVP_INTERESTED
        ? {emoji: '🤔', label: _(msg`Interested`)}
        : {emoji: '😢', label: _(msg`Not going`)}

  return (
    <View
      style={[
        a.py_md,
        a.px_xl,
        !noBorder && [a.border_t, t.atoms.border_contrast_low],
      ]}>
      <ProfileCard.Link profile={rsvp.actor}>
        <ProfileCard.Outer>
          <ProfileCard.Header>
            <ProfileCard.Avatar
              profile={rsvp.actor}
              moderationOpts={moderationOpts}
            />
            <ProfileCard.NameAndHandle
              profile={rsvp.actor}
              moderationOpts={moderationOpts}
            />
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.rounded_full,
                a.px_md,
                a.py_xs,
                rsvp.status === RSVP_GOING
                  ? {backgroundColor: t.palette.primary_100}
                  : t.atoms.bg_contrast_50,
              ]}>
              <Text style={[a.text_sm]}>{response.emoji}</Text>
              <Text style={[a.text_sm, a.font_semi_bold]}>
                {response.label}
              </Text>
            </View>
          </ProfileCard.Header>
        </ProfileCard.Outer>
      </ProfileCard.Link>
    </View>
  )
}
