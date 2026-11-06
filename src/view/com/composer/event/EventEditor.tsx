import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {getLinkMeta} from '#/lib/link-meta/link-meta'
import {useAgent} from '#/state/session'
import {EventDateRange} from '#/view/com/composer/event/EventDateRange'
import {type PostAction} from '#/view/com/composer/state/composer'
import {UserBanner} from '#/view/com/util/UserBanner'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {CalendarDays_Stroke2_Corner0_Rounded as CalendarIcon} from '#/components/icons/CalendarDays'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {
  areEventDetailsValid,
  changeEventTime,
  EVENT_DESCRIPTION_MAX_GRAPHEMES,
  EVENT_NAME_MAX_GRAPHEMES,
  type EventDraft,
  type EventDraftFields,
  type EventDraftStep,
  eventEndsBeforeStart,
  eventLocationUrl,
  eventStartsInPast,
} from '#/features/events/draft'

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
  const linkImage = useLinkImage(
    event.step === 'cover' && !event.cover && !event.coverRemoved
      ? eventLocationUrl(event)
      : undefined,
  )
  const cover = event.cover
    ? 'url' in event.cover
      ? event.cover.url
      : event.cover.path
    : event.coverRemoved
      ? undefined
      : linkImage

  return (
    <View
      testID="eventEditor"
      style={[
        a.mt_lg,
        a.p_md,
        a.gap_md,
        a.rounded_md,
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
        <Button
          testID="removeEventBtn"
          label={l`Remove event`}
          size="tiny"
          variant="ghost"
          color="secondary"
          onPress={() => {
            ax.metric('composer:event:remove', {})
            dispatch({type: 'embed_remove_event'})
          }}>
          <ButtonText>
            <Trans>Remove</Trans>
          </ButtonText>
        </Button>
      </View>

      {event.step === 'details' && (
        <DetailsStep event={event} update={update} />
      )}
      {event.step === 'when' && <WhenStep event={event} update={update} />}
      {event.step === 'cover' && (
        <View style={[a.gap_xs]}>
          <TextField.LabelText>
            <Trans>Select the event image</Trans>
          </TextField.LabelText>
          <View style={[a.rounded_sm, a.overflow_hidden]}>
            <UserBanner
              banner={cover}
              onSelectNewBanner={image =>
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
      {event.step === 'done' && (
        <View style={[a.flex_row, a.align_center, a.justify_between]}>
          <Text style={[a.text_md, a.font_bold, a.flex_1]} numberOfLines={2}>
            {event.name.trim()}
          </Text>
          <Button
            testID="editEventBtn"
            label={l`Edit event`}
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => setStep('details')}>
            <ButtonText>
              <Trans>Edit</Trans>
            </ButtonText>
          </Button>
        </View>
      )}

      {stepIndex >= 0 && (
        <View style={[a.flex_row, a.align_center, a.justify_between]}>
          <Text
            testID="eventStepLabel"
            style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
            <Trans comment="Progress through the steps of creating an event in the post composer">
              Step {stepIndex + 1} of {STEPS.length}
            </Trans>
          </Text>
          <View style={[a.flex_row, a.gap_sm]}>
            {stepIndex > 0 && (
              <Button
                testID="eventBackBtn"
                label={l`Back`}
                size="small"
                variant="solid"
                color="secondary"
                onPress={() => setStep(STEPS[stepIndex - 1])}>
                <ButtonText>
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
        <TextField.LabelText>
          <Trans>Create your event</Trans>
        </TextField.LabelText>
        <TextField.Root isInvalid={nameCount > EVENT_NAME_MAX_GRAPHEMES}>
          <TextField.Input
            testID="eventNameInput"
            label={l`Event name`}
            placeholder={l`Event name`}
            value={event.name}
            onChangeText={name => update({name})}
          />
        </TextField.Root>
        <Counter count={nameCount} max={EVENT_NAME_MAX_GRAPHEMES} />
      </View>
      <View>
        <TextField.LabelText>
          <Trans>Describe your event (optional)</Trans>
        </TextField.LabelText>
        <TextField.Root
          isInvalid={descriptionCount > EVENT_DESCRIPTION_MAX_GRAPHEMES}>
          <TextField.Input
            testID="eventDescriptionInput"
            label={l`Event description`}
            placeholder={l`About this event`}
            value={event.description}
            onChangeText={description => update({description})}
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
        <TextField.LabelText>
          <Trans>Add location</Trans>
        </TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            testID="eventLocationInput"
            label={l`Event location`}
            placeholder={l`External link or in-person location`}
            value={event.location}
            onChangeText={location => update({location})}
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
  const agent = useAgent()
  const {data} = useQuery({
    queryKey: ['event-cover-link-image', url],
    queryFn: async () => (await getLinkMeta(agent, url!)).image ?? null,
    enabled: !!url,
    staleTime: Infinity,
  })
  return data ?? undefined
}
