import {AtUri, type BskyAgent} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {communityXrpc} from '#/lib/api/community'
import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'
import {applyRsvp} from './rsvp-state'
import {mergeEventTimeline} from './timeline'
import {
  type EventView,
  RSVP_COLLECTION,
  type RsvpStatus,
  type RsvpView,
} from './types'

const EVENT_RQKEY_ROOT = 'calendar-event'
export const EVENT_RQKEY = (uri: string) => [EVENT_RQKEY_ROOT, uri]
const RSVPS_RQKEY_ROOT = 'calendar-event-rsvps'
const RSVPS_RQKEY = (uri: string, status: string, section: string) => [
  RSVPS_RQKEY_ROOT,
  uri,
  status,
  section,
]
const MY_EVENTS_RQKEY_ROOT = 'calendar-my-events'

async function xrpcJson<T>(
  agent: BskyAgent,
  method: string,
  params: Record<string, string | number | string[] | undefined>,
): Promise<T> {
  const res = await communityXrpc(agent, method, {params})
  if (!res.ok) throw new Error(`${method} failed: ${res.status}`)
  return (await res.json()) as T
}

export async function fetchEvents(
  agent: BskyAgent,
  uris: string[],
): Promise<EventView[]> {
  const {events} = await xrpcJson<{events: EventView[]}>(
    agent,
    'community.blacksky.calendar.getEvents',
    {uris},
  )
  return events
}

export function useEventQuery(uri: string | undefined, initial?: EventView) {
  const agent = useAgent()
  return useQuery<EventView | null>({
    queryKey: EVENT_RQKEY(uri ?? ''),
    enabled: !!uri,
    staleTime: STALE.SECONDS.THIRTY,
    initialData: initial,
    queryFn: async () => {
      const events = await fetchEvents(agent, [uri!])
      return events[0] ?? null
    },
  })
}

type RsvpPage = {
  rsvps: RsvpView[]
  cursor?: string
  mutedOrBlockedCount?: number
}

export function useEventRsvpsQuery(
  uri: string | undefined,
  status: RsvpStatus | undefined,
  section: 'main' | 'mutedOrBlocked' = 'main',
  enabled = true,
) {
  const agent = useAgent()
  return useInfiniteQuery<
    RsvpPage,
    Error,
    InfiniteData<RsvpPage>,
    string[],
    string | undefined
  >({
    queryKey: RSVPS_RQKEY(uri ?? '', status ?? 'all', section),
    enabled: !!uri && enabled,
    staleTime: STALE.SECONDS.THIRTY,
    initialPageParam: undefined,
    getNextPageParam: page => page.cursor,
    queryFn: ({pageParam}) =>
      xrpcJson<RsvpPage>(agent, 'community.blacksky.calendar.getEventRsvps', {
        event: uri!,
        status,
        section,
        limit: 50,
        cursor: pageParam,
      }),
  })
}

type MyEventsPage = {events: EventView[]; cursor?: string}

export function useMyEventsQuery(when: 'upcoming' | 'past', enabled = true) {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  return useInfiniteQuery<
    MyEventsPage,
    Error,
    InfiniteData<MyEventsPage>,
    string[],
    string | undefined
  >({
    queryKey: [MY_EVENTS_RQKEY_ROOT, currentAccount?.did ?? '', when],
    enabled: !!currentAccount && enabled,
    staleTime: STALE.SECONDS.THIRTY,
    initialPageParam: undefined,
    getNextPageParam: page => page.cursor,
    queryFn: async ({pageParam}) => {
      const page = await xrpcJson<MyEventsPage>(
        agent,
        'community.blacksky.calendar.getMyEvents',
        {when, limit: 25, cursor: pageParam},
      )
      for (const event of page.events) {
        // A cached entry may hold an RSVP the AppView hasn't indexed yet.
        if (queryClient.getQueryData(EVENT_RQKEY(event.uri)) === undefined) {
          queryClient.setQueryData(EVENT_RQKEY(event.uri), event)
        }
      }
      return page
    },
  })
}

/**
 * The signed-in viewer's events as one list. Upcoming pages are fetched to the
 * end before past ones, so the list only ever grows at the bottom.
 */
export function useMyEventsTimeline(enabled = true) {
  const upcoming = useMyEventsQuery('upcoming', enabled)
  const past = useMyEventsQuery(
    'past',
    enabled && upcoming.isSuccess && !upcoming.hasNextPage,
  )
  const events = mergeEventTimeline(
    upcoming.data?.pages.flatMap(page => page.events) ?? [],
    past.data?.pages.flatMap(page => page.events) ?? [],
    new Date(),
  )
  const next = upcoming.hasNextPage ? upcoming : past
  return {
    events,
    isLoading: upcoming.isLoading || past.isLoading,
    error: upcoming.error ?? past.error,
    hasNextPage: upcoming.hasNextPage || past.hasNextPage,
    isFetchingNextPage: upcoming.isFetchingNextPage || past.isFetchingNextPage,
    fetchNextPage: () => next.fetchNextPage(),
    refetch: () => Promise.all([upcoming.refetch(), past.refetch()]),
  }
}

function markListsStale(queryClient: QueryClient, uri: string) {
  void queryClient.invalidateQueries({
    queryKey: [RSVPS_RQKEY_ROOT, uri],
    refetchType: 'none',
  })
  void queryClient.invalidateQueries({
    queryKey: [MY_EVENTS_RQKEY_ROOT],
    refetchType: 'none',
  })
}

export type RsvpChange = {
  status: RsvpStatus
  current?: {uri: string; status: string}
}

/**
 * Pressing the current status again removes the RSVP. `current` must be the
 * RSVP as rendered before the press: the optimistic update overwrites the
 * cached one. The PDS result is written through without refetching, since
 * the AppView lags the write.
 */
export function useRsvpMutation(event: EventView) {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const queryKey = EVENT_RQKEY(event.uri)

  return useMutation<
    {uri: string; status: RsvpStatus} | undefined,
    Error,
    RsvpChange,
    {prev?: EventView | null}
  >({
    mutationFn: async ({status, current}) => {
      if (!currentAccount) throw new Error('Not signed in')
      const repo = currentAccount.did
      if (current && current.status === status) {
        await agent.com.atproto.repo.deleteRecord({
          repo,
          collection: RSVP_COLLECTION,
          rkey: new AtUri(current.uri).rkey,
        })
        return undefined
      }
      const record = {
        $type: RSVP_COLLECTION,
        subject: {uri: event.uri, cid: event.cid},
        status,
      }
      if (current) {
        const res = await agent.com.atproto.repo.putRecord({
          repo,
          collection: RSVP_COLLECTION,
          rkey: new AtUri(current.uri).rkey,
          record,
        })
        return {uri: res.data.uri, status}
      }
      const res = await agent.com.atproto.repo.createRecord({
        repo,
        collection: RSVP_COLLECTION,
        record,
      })
      return {uri: res.data.uri, status}
    },
    onMutate: async ({status, current}) => {
      await queryClient.cancelQueries({queryKey})
      const prev = queryClient.getQueryData<EventView | null>(queryKey)
      const next =
        current?.status === status
          ? undefined
          : {uri: current?.uri ?? 'pending', status}
      queryClient.setQueryData(queryKey, applyRsvp(prev ?? event, next))
      return {prev}
    },
    onError: (_error, _change, context) => {
      queryClient.setQueryData(queryKey, context?.prev ?? event)
    },
    onSuccess: result => {
      const base = queryClient.getQueryData<EventView | null>(queryKey) ?? event
      queryClient.setQueryData(queryKey, {
        ...base,
        viewer: {...base.viewer, rsvp: result},
      })
      markListsStale(queryClient, event.uri)
    },
  })
}
