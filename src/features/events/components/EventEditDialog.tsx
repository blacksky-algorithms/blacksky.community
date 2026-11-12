import {useRef, useState} from 'react'
import {useWindowDimensions, View} from 'react-native'
import {getLocales} from 'expo-localization'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {uploadEventCover} from '#/lib/api'
import {logger} from '#/logger'
import {useAgent} from '#/state/session'
import {EventCoverPicker} from '#/view/com/composer/event/EventCoverPicker'
import {EventDateRange} from '#/view/com/composer/event/EventDateRange'
import {Counter} from '#/view/com/composer/event/EventFields'
import {Poster} from '#/screens/Event/EventHeader'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Camera_Filled_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {
  applyEventEdits,
  areEventDetailsValid,
  changeEventTime,
  EVENT_DESCRIPTION_MAX_GRAPHEMES,
  EVENT_NAME_MAX_GRAPHEMES,
  type EventDraftFields,
  eventDraftFromRecord,
  eventEndsBeforeStart,
} from '../draft'
import {EVENT_RQKEY, EventGoneError, useEventWriteMutation} from '../queries'
import {type ParsedEvent} from '../record'
import {type EventView} from '../types'

const EDITABLE = [
  'name',
  'description',
  'location',
  'startsAt',
  'endsAt',
  'cover',
] as const

export function EventEditDialog({
  control,
  event,
  parsed,
}: {
  control: Dialog.DialogControlProps
  event: EventView
  parsed: ParsedEvent
}) {
  const {height} = useWindowDimensions()
  const [isSaving, setIsSaving] = useState(false)
  return (
    <Dialog.Outer
      control={control}
      nativeOptions={{preventDismiss: isSaving, minHeight: height}}
      webOptions={{
        onBackgroundPress: () => {
          if (!isSaving) control.close()
        },
      }}
      testID="eventEditDialog">
      <EditForm
        event={event}
        parsed={parsed}
        isSaving={isSaving}
        setIsSaving={setIsSaving}
      />
    </Dialog.Outer>
  )
}

function EditForm({
  event,
  parsed,
  isSaving,
  setIsSaving,
}: {
  event: EventView
  parsed: ParsedEvent
  isSaving: boolean
  setIsSaving: (isSaving: boolean) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const agent = useAgent()
  const queryClient = useQueryClient()
  const control = Dialog.useDialogContext()
  const {mutateAsync: write} = useEventWriteMutation(event.uri)
  const [initial] = useState(() => eventDraftFromRecord(parsed, event.thumb))
  const [draft, setDraft] = useState(initial)
  const saving = useRef(false)
  const nameCount = countGraphemes(draft.name.trim())
  const descriptionCount = countGraphemes(draft.description.trim())
  const endsBeforeStart = eventEndsBeforeStart(draft)
  const isDirty = EDITABLE.some(key => draft[key] !== initial[key])
  const canSave =
    isDirty && !isSaving && areEventDetailsValid(draft) && !endsBeforeStart
  const coverSrc =
    draft.cover && ('url' in draft.cover ? draft.cover.url : draft.cover.path)

  const update = (fields: Partial<EventDraftFields>) => {
    if (saving.current) return
    setDraft(prev => ({...prev, ...fields}))
  }

  const save = async () => {
    if (saving.current || !canSave) return
    saving.current = true
    setIsSaving(true)
    try {
      const coverChanged = draft.cover !== initial.cover
      const cover = !coverChanged
        ? undefined
        : draft.cover
          ? await uploadEventCover(agent, draft.cover, undefined)
          : null
      await write(current =>
        applyEventEdits(current, initial, draft, {
          country: getLocales()[0]?.regionCode ?? undefined,
          cover,
        }),
      )
      if (coverChanged) {
        queryClient.setQueryData<EventView | null>(
          EVENT_RQKEY(event.uri),
          prev => prev && {...prev, thumb: coverSrc},
        )
      }
      setIsSaving(false)
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
      saving.current = false
      setIsSaving(false)
    }
  }

  return (
    <Dialog.ScrollableInner
      label={l`Edit event`}
      contentContainerStyle={[a.px_0, a.pt_0]}
      header={
        <Dialog.Header
          style={{borderBottomWidth: 0}}
          renderLeft={() => (
            <Button
              testID="eventEditCancelBtn"
              label={l`Cancel`}
              onPress={() => control.close()}
              disabled={isSaving}
              size="small"
              color="secondary"
              variant="ghost"
              style={[a.rounded_full]}>
              <ButtonText style={[a.text_md, t.atoms.text_contrast_medium]}>
                <Trans>Cancel</Trans>
              </ButtonText>
            </Button>
          )}
          renderRight={() => (
            <Button
              testID="eventEditSaveBtn"
              label={l`Save`}
              onPress={() => void save()}
              disabled={!canSave}
              size="small"
              color="primary"
              variant="ghost"
              style={[a.rounded_full]}>
              <ButtonText
                style={[a.text_md, !canSave && t.atoms.text_contrast_low]}>
                <Trans>Save</Trans>
              </ButtonText>
            </Button>
          )}>
          <Dialog.HeaderText style={[a.font_normal]}>
            <Trans>Edit event</Trans>
          </Dialog.HeaderText>
        </Dialog.Header>
      }>
      <View style={[a.pt_lg, a.gap_lg]}>
        <EventCoverPicker
          cover={coverSrc}
          onChange={image =>
            update({
              cover: image
                ? {
                    path: image.path,
                    mime: image.mime,
                    width: image.width,
                    height: image.height,
                  }
                : undefined,
            })
          }>
          <View style={[a.self_center]}>
            <Poster event={{...event, thumb: coverSrc}} parsed={parsed} />
            <View
              style={[
                a.absolute,
                a.rounded_full,
                a.align_center,
                a.justify_center,
                {
                  right: 15,
                  bottom: 13,
                  width: 33,
                  height: 33,
                  opacity: 0.85,
                  backgroundColor: t.palette.primary_50,
                },
              ]}>
              <CameraIcon size="sm" style={t.atoms.text} />
            </View>
          </View>
        </EventCoverPicker>
        <View style={[a.px_5xl, {gap: 10}]}>
          <View>
            <TextField.LabelText>
              <Trans>Event title</Trans>
            </TextField.LabelText>
            <TextField.Root isInvalid={nameCount > EVENT_NAME_MAX_GRAPHEMES}>
              <TextField.Input
                testID="eventNameInput"
                label={l`Event title`}
                value={draft.name}
                onChangeText={name => update({name})}
              />
            </TextField.Root>
            <Counter count={nameCount} max={EVENT_NAME_MAX_GRAPHEMES} />
          </View>
          <View>
            <TextField.LabelText>
              <Trans>Event location</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                testID="eventLocationInput"
                label={l`Event location`}
                value={draft.location}
                onChangeText={location => update({location})}
              />
            </TextField.Root>
          </View>
          <View>
            <TextField.LabelText>
              <Trans>Description</Trans>
            </TextField.LabelText>
            <TextField.Root
              isInvalid={descriptionCount > EVENT_DESCRIPTION_MAX_GRAPHEMES}>
              <TextField.Input
                testID="eventDescriptionInput"
                label={l`Description`}
                value={draft.description}
                onChangeText={description => update({description})}
                multiline
              />
            </TextField.Root>
            <Counter
              count={descriptionCount}
              max={EVENT_DESCRIPTION_MAX_GRAPHEMES}
            />
          </View>
          <EventDateRange
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            isEndInvalid={endsBeforeStart}
            onChange={(field, iso) =>
              update(changeEventTime(draft, field, iso))
            }
          />
          {endsBeforeStart && (
            <Text
              testID="eventEndsBeforeStart"
              style={[a.text_xs, {color: t.palette.negative_500}]}>
              <Trans>The end date must be after the start date.</Trans>
            </Text>
          )}
        </View>
      </View>
    </Dialog.ScrollableInner>
  )
}
