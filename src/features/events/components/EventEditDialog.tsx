import {useRef, useState} from 'react'
import {getLocales} from 'expo-localization'
import {useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {uploadEventCover} from '#/lib/api'
import {logger} from '#/logger'
import {useAgent} from '#/state/session'
import {EventEditor} from '#/view/com/composer/event/EventEditor'
import {type PostAction} from '#/view/com/composer/state/composer'
import * as Dialog from '#/components/Dialog'
import * as Toast from '#/components/Toast'
import {applyEventEdits, type EventDraft, eventDraftFromRecord} from '../draft'
import {EVENT_RQKEY, EventGoneError, useEventWriteMutation} from '../queries'
import {type ParsedEvent} from '../record'
import {type EventView} from '../types'

export function EventEditDialog({
  control,
  event,
  parsed,
}: {
  control: Dialog.DialogControlProps
  event: EventView
  parsed: ParsedEvent
}) {
  const {t: l} = useLingui()
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <Dialog.ScrollableInner label={l`Edit event`}>
        <EditForm event={event} parsed={parsed} />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

function EditForm({event, parsed}: {event: EventView; parsed: ParsedEvent}) {
  const {t: l} = useLingui()
  const agent = useAgent()
  const queryClient = useQueryClient()
  const control = Dialog.useDialogContext()
  const {mutateAsync: write} = useEventWriteMutation(event.uri)
  const [initial] = useState(() => eventDraftFromRecord(parsed, event.thumb))
  const [draft, setDraft] = useState(initial)
  const latest = useRef(draft)
  const isSaving = useRef(false)

  const save = async (edited: EventDraft) => {
    isSaving.current = true
    try {
      const coverChanged = edited.cover !== initial.cover
      const cover = !coverChanged
        ? undefined
        : edited.cover
          ? await uploadEventCover(agent, edited.cover, undefined)
          : null
      await write(current =>
        applyEventEdits(current, initial, edited, {
          country: getLocales()[0]?.regionCode ?? undefined,
          cover,
        }),
      )
      if (coverChanged) {
        queryClient.setQueryData<EventView | null>(
          EVENT_RQKEY(event.uri),
          prev =>
            prev && {
              ...prev,
              thumb: edited.cover
                ? 'url' in edited.cover
                  ? edited.cover.url
                  : edited.cover.path
                : undefined,
            },
        )
      }
      control.close()
      Toast.show(l({message: 'Event updated', context: 'toast'}))
    } catch (e) {
      logger.error('Failed to update event', {safeMessage: e})
      Toast.show(
        e instanceof EventGoneError
          ? l`This event no longer exists.`
          : l`Couldn't save the event. Try again.`,
        {type: 'error'},
      )
      isSaving.current = false
    }
  }

  const dispatch = (action: PostAction) => {
    if (isSaving.current) return
    let next = latest.current
    if (action.type === 'embed_update_event') {
      next = {...next, ...action.fields}
    } else if (action.type === 'embed_set_event_step') {
      if (action.step === 'done') {
        void save(next)
        return
      }
      next = {...next, step: action.step}
    } else if (action.type === 'embed_remove_event') {
      control.close()
      return
    }
    latest.current = next
    setDraft(next)
  }

  return <EventEditor event={draft} dispatch={dispatch} isEditing />
}
