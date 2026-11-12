import {AtUri} from '@atproto/api'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {shareUrl} from '#/lib/sharing'
import {toShareUrl} from '#/lib/strings/url-helpers'
import {logger} from '#/logger'
import {useSession} from '#/state/session'
import {Button, ButtonIcon} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {ArrowOutOfBoxModified_Stroke2_Corner2_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsIcon} from '#/components/icons/DotGrid'
import {EditBig_Stroke2_Corner2_Rounded as EditIcon} from '#/components/icons/EditBig'
import {TimesLarge_Stroke2_Corner0_Rounded as CancelIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {useAnalytics} from '#/analytics'
import {useEventWriteMutation} from '../queries'
import {type ParsedEvent} from '../record'
import {EVENT_COLLECTION, type EventView} from '../types'
import {makeEventLink} from '../url'
import {EventEditDialog} from './EventEditDialog'

export function EventHostMenu({
  event,
  parsed,
}: {
  event: EventView
  parsed: ParsedEvent
}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const {currentAccount} = useSession()
  const navigation = useNavigation<NavigationProp>()
  const editControl = useDialogControl()
  const cancelControl = useDialogControl()
  const deleteControl = useDialogControl()
  const {mutateAsync: write} = useEventWriteMutation(event.uri)
  const isHost =
    currentAccount?.did === event.creator.did &&
    ax.features.enabled(ax.features.EventsEnable)

  const onCancel = async () => {
    try {
      await write(current => ({
        ...current,
        status: `${EVENT_COLLECTION}#cancelled`,
      }))
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
              variant="solid"
              color="primary">
              <ButtonIcon icon={DotsIcon} />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer showCancel>
          <Menu.Group>
            <Menu.Item
              testID="shareEventBtn"
              label={l`Share via...`}
              onPress={() =>
                void shareUrl(
                  toShareUrl(
                    makeEventLink(event.creator, new AtUri(event.uri).rkey),
                  ),
                )
              }>
              <Menu.ItemText>
                <Trans>Share via...</Trans>
              </Menu.ItemText>
              <Menu.ItemIcon icon={ShareIcon} />
            </Menu.Item>
          </Menu.Group>
          {isHost && (
            <>
              <Menu.Divider />
              <Menu.Group>
                <Menu.Item
                  testID="editEventBtn"
                  label={l`Edit event`}
                  onPress={() => editControl.open()}>
                  <Menu.ItemText>
                    <Trans>Edit event</Trans>
                  </Menu.ItemText>
                  <Menu.ItemIcon icon={EditIcon} />
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
              </Menu.Group>
              <Menu.Divider />
              <Menu.Group>
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
            </>
          )}
        </Menu.Outer>
      </Menu.Root>
      {isHost && (
        <EventEditDialog control={editControl} event={event} parsed={parsed} />
      )}
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
