import {View} from 'react-native'
import {getLocales} from 'expo-localization'
import {type HandleString} from '@atproto/syntax'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {getLinkMeta} from '#/lib/link-meta/link-meta'
import {useSession} from '#/state/session'
import {EventCoverPicker} from '#/view/com/composer/event/EventCoverPicker'
import {EventDateRange} from '#/view/com/composer/event/EventDateRange'
import {FieldLabelText, INPUT_TEXT} from '#/view/com/composer/event/EventFields'
import {type PostAction} from '#/view/com/composer/state/composer'
import {atoms as a, useTheme} from '#/alf'
import {DEFAULT_BRAND} from '#/alf/themes'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {CalendarDays_Stroke2_Corner0_Rounded as CalendarIcon} from '#/components/icons/CalendarDays'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsIcon} from '#/components/icons/DotGrid'
import {Pencil_Stroke2_Corner0_Rounded as PencilIcon} from '#/components/icons/Pencil'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {EventEmbedCard} from '#/features/events/components/EventEmbed'
import {
  areEventDetailsValid,
  buildEventRecord,
  changeEventTime,
  deviceTimeZone,
  EVENT_DESCRIPTION_MAX_GRAPHEMES,
  EVENT_NAME_MAX_GRAPHEMES,
  type EventDraft,
  type EventDraftFields,
  type EventDraftStep,
  eventEndsBeforeStart,
  eventLocationUrl,
  eventStartsInPast,
} from '#/features/events/draft'
import {parseEventRecord} from '#/features/events/record'
import {eventAtUri} from '#/features/events/url'

const STEPS: EventDraftStep[] = ['details', 'when', 'cover']

export function EventEditor({
  event,
  dispatch,
}: {
  event: EventDraft
  dispatch: (action: PostAction) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const stepIndex = STEPS.indexOf(event.step)
  const update = (fields: Partial<EventDraftFields>) =>
    dispatch({type: 'embed_update_event', fields})
  const setStep = (step: EventDraftStep) =>
    dispatch({type: 'embed_set_event_step', step})
  const canContinue =
    event.step === 'details'
      ? areEventDetailsValid(event)
      : event.step === 'when'
        ? !eventEndsBeforeStart(event)
        : true
  const isLastStep = stepIndex === STEPS.length - 1
  const stepColor =
    t.name === 'light' ? t.palette.primary_500 : DEFAULT_BRAND.secondary
  const remove = () => {
    ax.metric('composer:event:remove', {})
    dispatch({type: 'embed_remove_event'})
  }
  const linkImage = useLinkImage(
    event.step === 'cover' && !event.cover && !event.coverRemoved
      ? eventLocationUrl(event)
      : undefined,
  )
  const cover =
    coverUri(event.cover) ?? (event.coverRemoved ? undefined : linkImage)

  return (
    <View
      testID="eventEditor"
      style={[
        a.mt_lg,
        a.gap_xl,
        a.rounded_md,
        {padding: 13},
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <CalendarIcon size="sm" fill={t.palette.primary_500} />
          <Text style={[a.text_sm, {color: t.palette.primary_500}]}>
            <Trans comment="Heading of the event editor card in the post composer">
              Event
            </Trans>
          </Text>
        </View>
        {event.step === 'done' ? (
          <Menu.Root>
            <Menu.Trigger label={l`Event options`}>
              {({props}) => (
                <Button
                  {...props}
                  testID="eventMenuBtn"
                  label={props.accessibilityLabel}
                  size="tiny"
                  shape="round"
                  variant="ghost"
                  color="secondary">
                  <ButtonIcon icon={DotsIcon} />
                </Button>
              )}
            </Menu.Trigger>
            <Menu.Outer showCancel>
              <Menu.Group>
                <Menu.Item
                  testID="editEventBtn"
                  label={l`Edit event`}
                  onPress={() => setStep('details')}>
                  <Menu.ItemText>
                    <Trans>Edit event</Trans>
                  </Menu.ItemText>
                  <Menu.ItemIcon icon={PencilIcon} />
                </Menu.Item>
                <Menu.Item
                  testID="deleteEventBtn"
                  label={l`Delete event`}
                  onPress={remove}>
                  <Menu.ItemText>
                    <Trans>Delete event</Trans>
                  </Menu.ItemText>
                  <Menu.ItemIcon icon={TrashIcon} />
                </Menu.Item>
              </Menu.Group>
            </Menu.Outer>
          </Menu.Root>
        ) : (
          <Button
            testID="removeEventBtn"
            label={l`Remove event`}
            size="tiny"
            variant="solid"
            color="secondary"
            style={[t.atoms.bg, a.px_lg, {height: 28}]}
            onPress={remove}>
            <ButtonText style={[a.text_xs, t.atoms.text_contrast_medium]}>
              <Trans>Remove</Trans>
            </ButtonText>
          </Button>
        )}
      </View>

      {event.step === 'details' && (
        <DetailsStep event={event} update={update} />
      )}
      {event.step === 'when' && <WhenStep event={event} update={update} />}
      {event.step === 'cover' && (
        <View>
          <FieldLabelText>
            <Trans>Select the event image</Trans>
          </FieldLabelText>
          <View>
            <EventCoverPicker
              cover={cover}
              onChange={image =>
                update(
                  image
                    ? {
                        cover: {
                          path: image.path,
                          mime: image.mime,
                          width: image.width,
                          height: image.height,
                        },
                        coverRemoved: false,
                      }
                    : {cover: undefined, coverRemoved: true},
                )
              }
            />
          </View>
        </View>
      )}
      {event.step === 'done' && <EventPreview event={event} />}

      {stepIndex >= 0 && (
        <View style={[a.flex_row, a.align_center, a.justify_between]}>
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <View style={{width: 12, height: 12, backgroundColor: stepColor}} />
            <Text
              testID="eventStepLabel"
              style={[
                a.font_mono,
                {
                  fontSize: 14,
                  fontWeight: '300',
                  letterSpacing: -0.08,
                  textTransform: 'uppercase',
                  color: stepColor,
                },
              ]}>
              <Trans comment="Progress through the steps of creating an event in the post composer">
                Step {stepIndex + 1} of {STEPS.length}
              </Trans>
            </Text>
          </View>
          <View style={[a.flex_row, a.gap_sm]}>
            {stepIndex > 0 && (
              <Button
                testID="eventBackBtn"
                label={l`Back`}
                size="small"
                variant="solid"
                color="secondary"
                style={[t.atoms.bg, a.px_2xl]}
                onPress={() => setStep(STEPS[stepIndex - 1])}>
                <ButtonText style={{color: t.palette.primary_600}}>
                  <Trans>Back</Trans>
                </ButtonText>
              </Button>
            )}
            <Button
              testID="eventContinueBtn"
              label={isLastStep ? l`Create event` : l`Continue`}
              size="small"
              variant="solid"
              color="primary"
              style={[a.px_2xl]}
              disabled={!canContinue}
              onPress={() => {
                if (isLastStep && !event.cover && cover) {
                  update({cover: {url: cover}})
                }
                setStep(isLastStep ? 'done' : STEPS[stepIndex + 1])
              }}>
              <ButtonText>
                {isLastStep ? (
                  <Trans>Create event</Trans>
                ) : (
                  <Trans>Continue</Trans>
                )}
              </ButtonText>
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

function DetailsStep({
  event,
  update,
}: {
  event: EventDraft
  update: (fields: Partial<EventDraftFields>) => void
}) {
  const {t: l} = useLingui()
  const nameCount = countGraphemes(event.name.trim())
  const descriptionCount = countGraphemes(event.description.trim())

  return (
    <View style={[a.gap_sm]}>
      <View>
        <FieldLabelText>
          <Trans>Create your event</Trans>
        </FieldLabelText>
        <TextField.Root isInvalid={nameCount > EVENT_NAME_MAX_GRAPHEMES}>
          <TextField.Input
            testID="eventNameInput"
            label={l`Event name`}
            placeholder={l`Event name`}
            value={event.name}
            onChangeText={name => update({name})}
            style={INPUT_TEXT}
          />
        </TextField.Root>
        <Counter count={nameCount} max={EVENT_NAME_MAX_GRAPHEMES} />
      </View>
      <View>
        <FieldLabelText>
          <Trans>Describe your event (optional)</Trans>
        </FieldLabelText>
        <TextField.Root
          isInvalid={descriptionCount > EVENT_DESCRIPTION_MAX_GRAPHEMES}>
          <TextField.Input
            testID="eventDescriptionInput"
            label={l`Event description`}
            placeholder={l`About this event`}
            value={event.description}
            onChangeText={description => update({description})}
            style={INPUT_TEXT}
            multiline
          />
        </TextField.Root>
        <Counter
          count={descriptionCount}
          max={EVENT_DESCRIPTION_MAX_GRAPHEMES}
        />
      </View>
    </View>
  )
}

function WhenStep({
  event,
  update,
}: {
  event: EventDraft
  update: (fields: Partial<EventDraftFields>) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const endsBeforeStart = eventEndsBeforeStart(event)
  const startsInPast = eventStartsInPast(event)

  return (
    <View style={[a.gap_sm]}>
      <View>
        <FieldLabelText>
          <Trans>Add location</Trans>
        </FieldLabelText>
        <TextField.Root>
          <TextField.Input
            testID="eventLocationInput"
            label={l`Event location`}
            placeholder={l`External link or in-person location`}
            value={event.location}
            onChangeText={location => update({location})}
            style={INPUT_TEXT}
          />
        </TextField.Root>
      </View>
      <EventDateRange
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        isEndInvalid={endsBeforeStart}
        onChange={(field, iso) => update(changeEventTime(event, field, iso))}
      />
      {endsBeforeStart ? (
        <Text
          testID="eventEndsBeforeStart"
          style={[a.text_xs, {color: t.palette.negative_500}]}>
          <Trans>The end date must be after the start date.</Trans>
        </Text>
      ) : startsInPast ? (
        <Text
          testID="eventStartsInPast"
          style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>This event starts in the past.</Trans>
        </Text>
      ) : null}
    </View>
  )
}

function Counter({count, max}: {count: number; max: number}) {
  const t = useTheme()
  return (
    <Text
      style={[
        a.text_xs,
        a.text_right,
        a.mt_2xs,
        count > max
          ? {color: t.palette.negative_500}
          : t.atoms.text_contrast_medium,
      ]}>
      {`${count} / ${max}`}
    </Text>
  )
}

function useLinkImage(url: string | undefined) {
  const {data} = useQuery({
    queryKey: ['event-cover-link-image', url],
    queryFn: async () => (await getLinkMeta(url!)).image ?? null,
    enabled: !!url,
    staleTime: Infinity,
  })
  return data ?? undefined
}

function EventPreview({event}: {event: EventDraft}) {
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  if (!currentAccount) return null
  const record = buildEventRecord(event, {
    now: new Date(),
    timeZone: deviceTimeZone(),
    country: getLocales()[0]?.regionCode ?? undefined,
  })
  const parsed = parseEventRecord(record)
  if (!parsed) return null
  return (
    <View
      testID="eventPreview"
      accessible
      accessibilityLabel={l`Preview of ${parsed.name}`}
      accessibilityHint={l`Shows how the event will look in the feed`}>
      <EventEmbedCard
        event={{
          uri: eventAtUri(currentAccount.did, 'preview'),
          cid: '',
          creator: {
            did: currentAccount.did,
            handle: currentAccount.handle as HandleString,
          },
          record,
          thumb: coverUri(event.cover),
          goingCount: 0,
          interestedCount: 0,
          indexedAt: '',
        }}
        parsed={parsed}
        rkey="preview"
        preview
      />
    </View>
  )
}

function coverUri(cover: EventDraft['cover']) {
  return cover && ('url' in cover ? cover.url : cover.path)
}
