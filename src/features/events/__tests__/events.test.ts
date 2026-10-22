import {describe, expect, it} from '@jest/globals'
import {setupI18n} from '@lingui/core'

import {
  eventDateParts,
  eventLinkLabel,
  eventPhase,
  formatEventTime,
} from '../format'
import {inLiveWindow, isLiveOnStreamplace} from '../live'
import {eventPoster} from '../poster'
import {coverUrl, parseEventRecord} from '../record'
import {applyRsvp} from '../rsvp-state'
import {mergeEventTimeline} from '../timeline'
import {
  type EventView,
  RSVP_GOING,
  RSVP_INTERESTED,
  RSVP_NOTGOING,
} from '../types'
import {makeEventLink, parseEventUrl} from '../url'

describe('parseEventRecord', () => {
  it('reads the published fields and common extensions', () => {
    const parsed = parseEventRecord({
      $type: 'community.lexicon.calendar.event',
      name: 'Block party',
      description: 'Bring a dish',
      startsAt: '2026-10-01T23:00:00.000Z',
      endsAt: '2026-10-02T02:00:00.000Z',
      timezone: 'America/New_York',
      mode: 'community.lexicon.calendar.event#hybrid',
      status: 'community.lexicon.calendar.event#cancelled',
      locations: [
        {
          $type: 'community.lexicon.location.address',
          name: 'Park',
          street: '1 Main St',
          locality: 'Brooklyn',
          country: 'US',
        },
        {uri: 'https://example.com/zoom', name: 'Zoom'},
      ],
      uris: [{uri: 'https://stream.place/did:plc:host', name: 'Streamplace'}],
    })
    expect(parsed).toMatchObject({
      name: 'Block party',
      description: 'Bring a dish',
      timezone: 'America/New_York',
      mode: 'hybrid',
      cancelled: true,
      location: 'Park, 1 Main St, Brooklyn',
      streamplaceUrl: 'https://stream.place/did:plc:host',
      joinUrl: 'https://example.com/zoom',
    })
    expect(parsed?.startsAt?.toISOString()).toBe('2026-10-01T23:00:00.000Z')
    expect(parsed?.links.map(link => link.uri)).toEqual([
      'https://stream.place/did:plc:host',
      'https://example.com/zoom',
    ])
  })

  it('drops malformed optional fields instead of the event', () => {
    const parsed = parseEventRecord({
      name: 'Loose',
      startsAt: 'next tuesday',
      timezone: 'Mars/Olympus',
      mode: 'somewhere',
      locations: [null, 'text', {country: 'CA'}],
      uris: [{name: 'no uri'}],
    })
    expect(parsed).toEqual({
      name: 'Loose',
      description: undefined,
      startsAt: undefined,
      endsAt: undefined,
      timezone: undefined,
      mode: undefined,
      cancelled: false,
      location: 'CA',
      links: [],
      streamplaceUrl: undefined,
      joinUrl: undefined,
    })
  })

  it('takes the join link from uris when an online event has no uri location', () => {
    const parsed = parseEventRecord({
      name: 'Atmospheric Groups WG Meeting',
      mode: 'community.lexicon.calendar.event#virtual',
      uris: [{uri: 'https://meet.google.com/hcp-doqs-znu', name: ''}],
    })
    expect(parsed?.joinUrl).toBe('https://meet.google.com/hcp-doqs-znu')
  })

  it('prefers a uri location over uris, and has no join link in person', () => {
    const uris = [{uri: 'https://example.com/agenda'}]
    const locations = [{uri: 'https://zoom.us/j/1'}]
    expect(
      parseEventRecord({
        name: 'x',
        mode: 'community.lexicon.calendar.event#hybrid',
        uris,
        locations,
      })?.joinUrl,
    ).toBe('https://zoom.us/j/1')
    expect(parseEventRecord({name: 'x', uris, locations})?.joinUrl).toBe(
      undefined,
    )
  })

  it('drops links that are not http or https', () => {
    const parsed = parseEventRecord({
      name: 'x',
      mode: 'community.lexicon.calendar.event#virtual',
      locations: [{uri: 'javascript:alert(1)'}],
      uris: [
        {uri: 'javascript://stream.place/%0Aalert(1)'},
        {uri: 'intent://scan/#Intent;scheme=zxing;end'},
        {uri: 'tel:+15555550100'},
        {uri: 'https://example.com/agenda', name: 'Agenda'},
      ],
    })
    expect(parsed?.links).toEqual([
      {uri: 'https://example.com/agenda', name: 'Agenda'},
    ])
    expect(parsed?.streamplaceUrl).toBe(undefined)
    expect(parsed?.joinUrl).toBe('https://example.com/agenda')
  })

  it('rejects records without a name', () => {
    expect(parseEventRecord({startsAt: '2026-10-01T00:00:00Z'})).toBe(undefined)
    expect(parseEventRecord(null)).toBe(undefined)
    expect(parseEventRecord(['name'])).toBe(undefined)
  })
})

describe('parseEventUrl', () => {
  it('recognises Blacksky, atmo.rsvp and Smoke Signal event links', () => {
    expect(
      parseEventUrl('https://blacksky.community/event/alice.test/3kabc'),
    ).toEqual({actor: 'alice.test', rkey: '3kabc'})
    expect(
      parseEventUrl('https://staging.blacksky.community/event/did:plc:x/3kabc'),
    ).toEqual({actor: 'did:plc:x', rkey: '3kabc'})
    expect(parseEventUrl('https://atmo.rsvp/p/alice.test/e/3kabc')).toEqual({
      actor: 'alice.test',
      rkey: '3kabc',
    })
    expect(parseEventUrl('https://smokesignal.events/did:plc:x/3kabc')).toEqual(
      {actor: 'did:plc:x', rkey: '3kabc'},
    )
  })

  it('ignores other links', () => {
    for (const url of [
      'https://blacksky.community/profile/alice.test',
      'https://blacksky.community/event/alice/3kabc',
      'https://example.com/event/alice.test/3kabc',
      'https://smokesignal.events/about',
      'not a url',
      'https://example.com/sale-50%-off',
      'https://example.com/a%E0%A4%A',
      'https://blacksky.community/event/alice.test/%E0%A4%A',
    ]) {
      expect(parseEventUrl(url)).toBe(undefined)
    }
  })

  it('recognises the active brand domain when given', () => {
    const url = 'https://theinvite.community/event/alice.test/3kabc'
    expect(parseEventUrl(url)).toBe(undefined)
    expect(parseEventUrl(url, ['https://theinvite.community'])).toEqual({
      actor: 'alice.test',
      rkey: '3kabc',
    })
  })

  it('builds links the parser reads back', () => {
    expect(
      makeEventLink({did: 'did:plc:x', handle: 'handle.invalid'}, 'k'),
    ).toBe('/event/did:plc:x/k')
    expect(makeEventLink({did: 'did:plc:x', handle: ''}, 'k')).toBe(
      '/event/did:plc:x/k',
    )
    const link = makeEventLink(
      {did: 'did:plc:x', handle: 'alice.test'},
      '3kabc',
    )
    expect(link).toBe('/event/alice.test/3kabc')
    expect(parseEventUrl(`https://blacksky.community${link}`)).toEqual({
      actor: 'alice.test',
      rkey: '3kabc',
    })
  })
})

describe('eventDateParts', () => {
  const base = {name: 'x', cancelled: false, links: []}

  it('shows the end date when the event ends on a later day', () => {
    const parts = eventDateParts(
      {
        ...base,
        startsAt: new Date('2026-10-02T23:00:00.000Z'),
        endsAt: new Date('2026-10-04T21:00:00.000Z'),
        timezone: 'America/New_York',
      },
      'en-US',
    )
    expect(parts?.timeRange).toBe('7:00 PM – Sun, Oct 4, 5:00 PM EDT')
  })

  it('shows only times when the event ends the same day', () => {
    const parts = eventDateParts(
      {
        ...base,
        startsAt: new Date('2026-10-02T23:00:00.000Z'),
        endsAt: new Date('2026-10-03T02:00:00.000Z'),
        timezone: 'America/New_York',
      },
      'en-US',
    )
    expect(parts?.timeRange).toBe('7:00 PM – 10:00 PM EDT')
  })
})

describe('formatEventTime', () => {
  const base = {name: 'x', cancelled: false, links: []}

  it('shows the event timezone and the local time when they differ', () => {
    const time = formatEventTime(
      {
        ...base,
        startsAt: new Date('2026-10-01T23:00:00.000Z'),
        timezone: 'Asia/Tokyo',
      },
      'en-US',
    )
    expect(time?.primary).toContain('Oct 2')
    expect(time?.local).toBeDefined()
  })

  it('omits the local time when there is no event timezone', () => {
    const time = formatEventTime(
      {...base, startsAt: new Date('2026-10-01T23:00:00.000Z')},
      'en-US',
    )
    expect(time?.local).toBe(undefined)
    expect(formatEventTime(base, 'en-US')).toBe(undefined)
  })
})

describe('applyRsvp', () => {
  const event = (status?: string): EventView => ({
    uri: 'at://did:plc:host/community.lexicon.calendar.event/1',
    cid: 'cid',
    creator: {did: 'did:plc:host', handle: 'host.test'},
    record: {},
    goingCount: 3,
    interestedCount: 2,
    viewer: status ? {rsvp: {uri: 'at://me/rsvp/1', status}} : {},
    indexedAt: '',
  })

  it('moves the viewer between counts', () => {
    const next = applyRsvp(event(RSVP_INTERESTED), {
      uri: 'at://me/rsvp/1',
      status: RSVP_GOING,
    })
    expect([next.goingCount, next.interestedCount]).toEqual([4, 1])
    expect(next.viewer?.rsvp?.status).toBe(RSVP_GOING)
  })

  it('removes the viewer and never goes below zero', () => {
    const removed = applyRsvp(event(RSVP_GOING), undefined)
    expect([removed.goingCount, removed.viewer?.rsvp]).toEqual([2, undefined])
    const empty = applyRsvp({...event(RSVP_GOING), goingCount: 0}, undefined)
    expect(empty.goingCount).toBe(0)
  })

  it('does not count not-going', () => {
    const next = applyRsvp(event(), {uri: 'u', status: RSVP_NOTGOING})
    expect([next.goingCount, next.interestedCount]).toEqual([3, 2])
  })
})

describe('eventPhase', () => {
  const now = new Date('2026-10-01T20:00:00.000Z')
  const base = {name: 'x', cancelled: false, links: []}
  const at = (iso: string) => new Date(iso)

  it('is upcoming before the start', () => {
    expect(
      eventPhase({...base, startsAt: at('2026-10-01T21:00:00Z')}, now),
    ).toBe('upcoming')
  })

  it('is current between start and end, and past after the end', () => {
    const event = {
      ...base,
      startsAt: at('2026-10-01T18:00:00Z'),
      endsAt: at('2026-10-01T22:00:00Z'),
    }
    expect(eventPhase(event, now)).toBe('current')
    expect(eventPhase(event, at('2026-10-01T22:00:00Z'))).toBe('past')
  })

  it('assumes four hours when there is no end time', () => {
    expect(
      eventPhase({...base, startsAt: at('2026-10-01T16:30:00Z')}, now),
    ).toBe('current')
    expect(
      eventPhase({...base, startsAt: at('2026-10-01T15:59:00Z')}, now),
    ).toBe('past')
  })

  it('has no phase without a start time', () => {
    expect(eventPhase(base, now)).toBe(undefined)
  })
})

describe('mergeEventTimeline', () => {
  const now = new Date('2026-10-01T20:00:00.000Z')
  const view = (rkey: string, startsAt: string): EventView => ({
    uri: `at://did:plc:host/community.lexicon.calendar.event/${rkey}`,
    cid: 'cid',
    creator: {did: 'did:plc:host', handle: 'host.test'},
    record: {name: rkey, startsAt},
    goingCount: 0,
    interestedCount: 0,
    indexedAt: '',
  })

  it('puts happening-now first, then upcoming, then past, without duplicates', () => {
    const soon = view('soon', '2026-10-02T00:00:00Z')
    const later = view('later', '2026-10-05T00:00:00Z')
    const live = view('live', '2026-10-01T19:00:00Z')
    const old = view('old', '2026-09-01T00:00:00Z')
    const merged = mergeEventTimeline([soon, later], [live, old, soon], now)
    expect(merged.map(e => (e.record as {name: string}).name)).toEqual([
      'live',
      'soon',
      'later',
      'old',
    ])
  })
})

describe('coverUrl', () => {
  const label = (val: string) => ({
    src: 'did:plc:labeler',
    uri: 'at://did:plc:host/community.lexicon.calendar.event/k',
    val,
    cts: '2026-09-29T00:00:00.000Z',
  })

  it('hides the cover when the event carries a sensitive label', () => {
    expect(coverUrl({thumb: 'https://cdn/x', labels: [label('porn')]})).toBe(
      undefined,
    )
    expect(
      coverUrl({thumb: 'https://cdn/x', labels: [label('graphic-media')]}),
    ).toBe(undefined)
  })

  it('keeps the cover otherwise', () => {
    expect(coverUrl({thumb: 'https://cdn/x', labels: [label('spoiler')]})).toBe(
      'https://cdn/x',
    )
    expect(coverUrl({thumb: 'https://cdn/x'})).toBe('https://cdn/x')
  })
})

describe('eventPoster', () => {
  const base = {name: 'x', cancelled: false, links: []}
  const uri = 'at://did:plc:host/community.lexicon.calendar.event/3kabc'

  it('picks the same gradient for the same event, and varies across events', () => {
    const first = eventPoster(uri, base).gradient
    expect(eventPoster(uri, base).gradient).toBe(first)
    const seen = new Set(
      Array.from(
        {length: 40},
        (_, i) => eventPoster(`${uri}${i}`, base).gradient,
      ),
    )
    expect(seen.size).toBeGreaterThan(3)
  })

  it.each([
    ['Block party on Nostrand', '🎉'],
    ['Listening session (live)', '🎶'],
    ['Rooftop screening', '🎬'],
    ['Atmospheric Groups WG Meeting', '💬'],
    ["Alice's book club", '📚'],
    ['Summer cookout', '🍽️'],
    ['Open mic night', '🎤'],
  ])('matches keywords in the name: %s', (name, emoji) => {
    expect(eventPoster(uri, {...base, name}).emoji).toBe(emoji)
  })

  it('falls back to the description, then the attendance mode', () => {
    expect(
      eventPoster(uri, {...base, name: 'Saturday', description: 'Bring a book'})
        .emoji,
    ).toBe('📚')
    expect(eventPoster(uri, {...base, mode: 'virtual'}).emoji).toBe('💻')
    expect(eventPoster(uri, {...base, mode: 'hybrid'}).emoji).toBe('🌐')
    expect(eventPoster(uri, {...base, mode: 'inperson'}).emoji).toBe('📍')
    expect(
      eventPoster(uri, {
        ...base,
        mode: 'virtual',
        streamplaceUrl: 'https://stream.place/did:plc:x',
      }).emoji,
    ).toBe('📺')
    expect(eventPoster(uri, base).emoji).toBe('📅')
  })

  it('does not match keywords inside other words', () => {
    expect(
      eventPoster(uri, {...base, name: 'Gamestop earnings', mode: 'virtual'})
        .emoji,
    ).toBe('💻')
  })
})

describe('isLiveOnStreamplace', () => {
  const streamer = {did: 'did:plc:host', handle: 'Host.example.com'}
  const status = (uri: string, isActive = true) => ({
    status: 'app.bsky.actor.status#live',
    isActive,
    record: {},
    embed: {
      $type: 'app.bsky.embed.external#view',
      external: {uri, title: '', description: ''},
    },
  })

  it('is live when the status points at the same channel by DID or handle', () => {
    expect(
      isLiveOnStreamplace(
        status('https://stream.place/did:plc:host'),
        streamer,
      ),
    ).toBe(true)
    expect(
      isLiveOnStreamplace(
        status('https://stream.place/host.example.com'),
        streamer,
      ),
    ).toBe(true)
  })

  it('ignores other hosts, other channels and inactive statuses', () => {
    expect(
      isLiveOnStreamplace(status('https://twitch.tv/host'), streamer),
    ).toBe(false)
    expect(
      isLiveOnStreamplace(
        status('https://stream.place/did:plc:other'),
        streamer,
      ),
    ).toBe(false)
    expect(
      isLiveOnStreamplace(
        status('https://stream.place/did:plc:host', false),
        streamer,
      ),
    ).toBe(false)
    expect(
      isLiveOnStreamplace(
        {status: '', isActive: false, isDisabled: false, record: {}},
        streamer,
      ),
    ).toBe(false)
  })
})

describe('inLiveWindow', () => {
  const startsAt = new Date('2026-10-24T18:00:00Z')
  const endsAt = new Date('2026-10-24T20:00:00Z')
  const event = {name: 'Walk', links: [], cancelled: false, startsAt, endsAt}
  const at = (iso: string) => inLiveWindow(event, new Date(iso))

  it('covers an hour either side of the event', () => {
    expect(at('2026-10-24T17:00:00Z')).toBe(true)
    expect(at('2026-10-24T19:00:00Z')).toBe(true)
    expect(at('2026-10-24T20:59:00Z')).toBe(true)
  })

  it('ignores the channel well before or after the event', () => {
    expect(at('2026-10-17T18:00:00Z')).toBe(false)
    expect(at('2026-10-24T16:59:00Z')).toBe(false)
    expect(at('2026-10-24T21:01:00Z')).toBe(false)
    expect(inLiveWindow({...event, startsAt: undefined}, new Date())).toBe(
      false,
    )
  })
})

describe('eventLinkLabel', () => {
  const i18n = setupI18n({locale: 'en', messages: {en: {}}})

  it('reads status, time, place and counts for screen readers', () => {
    const parsed = parseEventRecord({
      name: 'Block party',
      startsAt: '2026-10-01T23:00:00.000Z',
      mode: 'community.lexicon.calendar.event#virtual',
      status: 'community.lexicon.calendar.event#cancelled',
    })!
    const counts = {goingCount: 3, interestedCount: 1} as EventView
    const label = eventLinkLabel(i18n, counts, parsed, 'upcoming')
    expect(label.startsWith('View event Block party, Cancelled, ')).toBe(true)
    expect(label.endsWith(', Online, 3 going, 1 interested')).toBe(true)
  })

  it('leaves out an unknown phase and zero interest', () => {
    const parsed = parseEventRecord({name: 'Meetup'})!
    const counts = {goingCount: 0, interestedCount: 0} as EventView
    expect(eventLinkLabel(i18n, counts, parsed)).toBe(
      'View event Meetup, 0 going',
    )
  })
})
