import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {logger} from '#/logger'
import {useRequireAuth} from '#/state/session'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import * as Toast from '#/components/Toast'
import {useRsvpMutation} from '../queries'
import {
  type EventView,
  RSVP_GOING,
  RSVP_INTERESTED,
  RSVP_NOTGOING,
  type RsvpStatus,
} from '../types'

export function RsvpButtons({
  event,
  size = 'small',
}: {
  event: EventView
  size?: 'small' | 'large'
}) {
  const {_} = useLingui()
  const requireAuth = useRequireAuth()
  const {mutate, isPending} = useRsvpMutation(event)
  const current = event.viewer?.rsvp?.status

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

  const choices: {status: RsvpStatus; label: string; removeLabel: string}[] = [
    {
      status: RSVP_GOING,
      label: _(msg`Going`),
      removeLabel: _(msg`Going, tap to remove`),
    },
    {
      status: RSVP_INTERESTED,
      label: _(msg`Interested`),
      removeLabel: _(msg`Interested, tap to remove`),
    },
    {
      status: RSVP_NOTGOING,
      label: _(msg`Not going`),
      removeLabel: _(msg`Not going, tap to remove`),
    },
  ]
  return (
    <View style={[a.flex_row, a.gap_sm]}>
      {choices.map(choice => {
        const selected = current === choice.status
        return (
          <Button
            key={choice.status}
            label={selected ? choice.removeLabel : choice.label}
            size={size}
            color={selected ? 'primary' : 'secondary'}
            disabled={isPending}
            style={[a.flex_1, a.px_xs]}
            onPress={() => onPress(choice.status)}>
            {selected && <ButtonIcon icon={CheckIcon} />}
            <ButtonText>{choice.label}</ButtonText>
          </Button>
        )
      })}
    </View>
  )
}
