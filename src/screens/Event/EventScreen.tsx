import {useCallback, useMemo, useState} from 'react'
import {View} from 'react-native'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {List} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {ListFooter, ListMaybePlaceholder} from '#/components/Lists'
import {Text} from '#/components/Typography'
import {useEventQuery, useEventRsvpsQuery} from '#/features/events/queries'
import {type ParsedEvent, parseEventRecord} from '#/features/events/record'
import {
  type EventView,
  RSVP_GOING,
  type RsvpView,
} from '#/features/events/types'
import {eventAtUri} from '#/features/events/url'
import {EventHeader, GuestRow} from './EventHeader'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Event'>

export function EventScreen({route}: Props) {
  const {_} = useLingui()
  const {name, rkey} = route.params
  const {data: did, error: resolveError} = useResolveDidQuery(name)
  const uri = did ? eventAtUri(did, rkey) : undefined
  const {data: event, isLoading, error, refetch} = useEventQuery(uri)
  const parsed = useMemo(
    () => (event ? parseEventRecord(event.record) : undefined),
    [event],
  )

  return (
    <Layout.Screen testID="eventScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content align="left">
          <Layout.Header.TitleText>
            <Trans>Event</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      {event && parsed ? (
        <EventBody event={event} parsed={parsed} />
      ) : (
        <ListMaybePlaceholder
          isLoading={isLoading || (!did && !resolveError)}
          isError={
            !!error || !!resolveError || event === null || (!!event && !parsed)
          }
          errorTitle={_(msg`Event not found`)}
          errorMessage={
            resolveError
              ? cleanError(resolveError)
              : error
                ? _(msg`Couldn't load this event. Try again in a moment.`)
                : _(msg`This event may have been deleted or isn't available.`)
          }
          onRetry={error ? refetch : undefined}
          topBorder={false}
          sideBorders={false}
        />
      )}
    </Layout.Screen>
  )
}

function EventBody({event, parsed}: {event: EventView; parsed: ParsedEvent}) {
  const {_} = useLingui()
  const {
    data,
    refetch,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEventRsvpsQuery(event.uri, undefined)
  const rsvps = useMemo(
    () => data?.pages.flatMap(page => page.rsvps) ?? [],
    [data],
  )
  const going = rsvps.filter(rsvp => rsvp.status === RSVP_GOING)
  const mutedOrBlockedCount = data?.pages[0]?.mutedOrBlockedCount ?? 0

  const renderItem = useCallback(
    ({item, index}: {item: RsvpView; index: number}) => (
      <GuestRow rsvp={item} noBorder={index === 0} />
    ),
    [],
  )

  return (
    <List
      data={rsvps}
      keyExtractor={(item: RsvpView) => item.uri}
      renderItem={renderItem}
      ListHeaderComponent={
        <View>
          <EventHeader event={event} parsed={parsed} guests={going} />
          {!isLoading &&
            !error &&
            event.goingCount + event.interestedCount === 0 && (
              <Text style={[a.px_lg, a.py_md, a.text_sm]}>
                <Trans>No one has RSVP'd yet.</Trans>
              </Text>
            )}
        </View>
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
      }}
      onEndReachedThreshold={2}
      ListFooterComponent={
        <View>
          <ListFooter
            isFetchingNextPage={isFetchingNextPage}
            error={error ? _(msg`Couldn't load the guest list.`) : undefined}
            onRetry={rsvps.length ? fetchNextPage : refetch}
          />
          {mutedOrBlockedCount > 0 && (
            <MutedOrBlockedSection
              eventUri={event.uri}
              count={mutedOrBlockedCount}
            />
          )}
        </View>
      }
      sideBorders={false}
    />
  )
}

function MutedOrBlockedSection({
  eventUri,
  count,
}: {
  eventUri: string
  count: number
}) {
  const t = useTheme()
  const {_} = useLingui()
  const [open, setOpen] = useState(false)
  const {data} = useEventRsvpsQuery(eventUri, undefined, 'mutedOrBlocked', open)
  const rsvps = data?.pages.flatMap(page => page.rsvps) ?? []

  return (
    <View style={[a.px_lg, a.py_md, a.border_t, t.atoms.border_contrast_low]}>
      <Button
        label={
          open
            ? _(msg`Hide muted or blocked accounts`)
            : _(msg`Show muted or blocked accounts`)
        }
        size="small"
        color="secondary"
        variant="ghost"
        style={[a.self_start]}
        onPress={() => setOpen(v => !v)}>
        <ButtonText>
          {plural(count, {
            one: '# muted or blocked account',
            other: '# muted or blocked accounts',
          })}
        </ButtonText>
      </Button>
      {open &&
        rsvps.map((item, index) => (
          <GuestRow key={item.uri} rsvp={item} noBorder={index === 0} />
        ))}
    </View>
  )
}
