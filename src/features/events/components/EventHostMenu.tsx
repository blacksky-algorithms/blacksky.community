import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {logger} from '#/logger'
import {useSession} from '#/state/session'
import {Button, ButtonIcon} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {CircleX_Stroke2_Corner0_Rounded as CancelIcon} from '#/components/icons/CircleX'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsIcon} from '#/components/icons/DotGrid'
import {Pencil_Stroke2_Corner0_Rounded as PencilIcon} from '#/components/icons/Pencil'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {useEventWriteMutation} from '../queries'
import {type ParsedEvent} from '../record'
import {EVENT_COLLECTION, type EventView} from '../types'
import {EventEditDialog} from './EventEditDialog'

export function EventHostMenu({
  event,
  parsed,
}: {
  event: EventView
  parsed: ParsedEvent
}) {
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const navigation = useNavigation<NavigationProp>()
  const editControl = useDialogControl()
  const cancelControl = useDialogControl()
  const deleteControl = useDialogControl()
  const {mutateAsync: write} = useEventWriteMutation(event.uri)

  if (currentAccount?.did !== event.creator.did) return null

  const onCancel = async () => {
    try {
      await write({
        ...(event.record as Record<string, unknown>),
        status: `${EVENT_COLLECTION}#cancelled`,
      })
      Toast.show(l({message: 'Event cancelled', context: 'toast'}))
    } catch (e) {
      logger.error('Failed to cancel event', {safeMessage: e})
      Toast.show(l`Couldn't cancel the event. Try again.`, {type: 'error'})
    }
  }

  const onDelete = async () => {
    try {
      await write(null)
      Toast.show(l({message: 'Event deleted', context: 'toast'}))
      if (navigation.canGoBack()) navigation.goBack()
    } catch (e) {
      logger.error('Failed to delete event', {safeMessage: e})
      Toast.show(l`Couldn't delete the event. Try again.`, {type: 'error'})
    }
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger label={l`Event options`}>
          {({props}) => (
            <Button
              {...props}
              testID="eventHostMenuBtn"
              label={props.accessibilityLabel}
              size="small"
              shape="round"
              variant="ghost"
              color="secondary">
              <ButtonIcon icon={DotsIcon} size="lg" />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          <Menu.Group>
            <Menu.Item
              testID="editEventBtn"
              label={l`Edit event`}
              onPress={() => editControl.open()}>
              <Menu.ItemText>
                <Trans>Edit event</Trans>
              </Menu.ItemText>
              <Menu.ItemIcon icon={PencilIcon} />
            </Menu.Item>
            {!parsed.cancelled && (
              <Menu.Item
                testID="cancelEventBtn"
                label={l`Cancel event`}
                onPress={() => cancelControl.open()}>
                <Menu.ItemText>
                  <Trans>Cancel event</Trans>
                </Menu.ItemText>
                <Menu.ItemIcon icon={CancelIcon} />
              </Menu.Item>
            )}
            <Menu.Item
              testID="deleteEventBtn"
              label={l`Delete event`}
              onPress={() => deleteControl.open()}>
              <Menu.ItemText>
                <Trans>Delete event</Trans>
              </Menu.ItemText>
              <Menu.ItemIcon icon={TrashIcon} />
            </Menu.Item>
          </Menu.Group>
        </Menu.Outer>
      </Menu.Root>
      <EventEditDialog control={editControl} event={event} parsed={parsed} />
      <Prompt.Basic
        control={cancelControl}
        title={l`Cancel this event?`}
        description={l`Guests will see that it's cancelled. Their responses stay.`}
        onConfirm={() => void onCancel()}
        confirmButtonCta={l`Cancel event`}
        cancelButtonCta={l`Keep event`}
        confirmButtonColor="negative"
      />
      <Prompt.Basic
        control={deleteControl}
        title={l`Delete this event?`}
        description={l`The event and its guest list will be removed. You won't be able to recover it.`}
        onConfirm={() => void onDelete()}
        confirmButtonCta={l`Delete`}
        confirmButtonColor="negative"
      />
    </>
  )
}
