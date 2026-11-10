import {applyEventEdits, eventDraftFromRecord} from '../draft'
import {parseEventRecord} from '../record'

const C = 'community.lexicon.calendar.event'

const original = {
  $type: C,
  name: 'Party',
  description: 'Bring snacks',
  createdAt: '2027-01-01T00:00:00.000Z',
  startsAt: '2027-01-15T00:00:00.000Z',
  endsAt: '2027-01-15T03:00:00.000Z',
  status: `${C}#scheduled`,
  timezone: 'America/New_York',
  mode: `${C}#inperson`,
  locations: [
    {
      $type: 'community.lexicon.location.address',
      name: 'Prospect Park',
      street: '95 Prospect Park W',
      locality: 'Brooklyn',
      country: 'US',
    },
    {
      $type: 'community.lexicon.location.geo',
      latitude: '40.66',
      longitude: '-73.97',
    },
  ],
  uris: [{uri: 'https://example.com/tickets', name: 'Tickets'}],
  media: [
    {
      role: 'thumbnail',
      content: {ref: 'old'},
      aspect_ratio: {width: 2, height: 1},
    },
    {role: 'gallery', content: {ref: 'other'}},
  ],
  createdWith: 'https://atmo.rsvp',
}

const initial = eventDraftFromRecord(
  parseEventRecord(original)!,
  'https://cdn.test/thumb.jpg',
)

describe('eventDraftFromRecord', () => {
  it('fills the editor from the published event', () => {
    expect(initial).toEqual({
      step: 'details',
      name: 'Party',
      description: 'Bring snacks',
      location: 'Prospect Park, 95 Prospect Park W, Brooklyn',
      startsAt: '2027-01-15T00:00:00.000Z',
      endsAt: '2027-01-15T03:00:00.000Z',
      cover: {url: 'https://cdn.test/thumb.jpg'},
    })
  })

  it('uses the join link as the location of an online event', () => {
    const draft = eventDraftFromRecord(
      parseEventRecord({
        name: 'Stream',
        startsAt: '2027-01-15T00:00:00.000Z',
        mode: `${C}#virtual`,
        locations: [{$type: `${C}#uri`, uri: 'https://twitch.tv/x'}],
      })!,
      undefined,
    )
    expect(draft.location).toBe('https://twitch.tv/x')
    expect(draft.endsAt).toBe(draft.startsAt)
    expect(draft).not.toHaveProperty('cover')
  })
})

describe('applyEventEdits', () => {
  it('changes only the edited fields and keeps what the editor cannot show', () => {
    const record = applyEventEdits(
      original,
      initial,
      {...initial, name: 'Bigger party', endsAt: '2027-01-15T05:00:00.000Z'},
      {country: 'US'},
    )
    expect(record).toEqual({
      ...original,
      name: 'Bigger party',
      endsAt: '2027-01-15T05:00:00.000Z',
    })
  })

  it('clears a removed description and an end that matches the start', () => {
    const record = applyEventEdits(
      original,
      initial,
      {...initial, description: '  ', endsAt: initial.startsAt},
      {},
    )
    expect(record).not.toHaveProperty('description')
    expect(record).not.toHaveProperty('endsAt')
  })

  it('replaces the locations only when the location text changes', () => {
    const record = applyEventEdits(
      original,
      initial,
      {...initial, location: 'zoom.us/j/123'},
      {},
    )
    expect(record.mode).toBe(`${C}#virtual`)
    expect(record.locations).toEqual([
      {$type: `${C}#uri`, uri: 'https://zoom.us/j/123'},
    ])
  })

  it('swaps the thumbnail and keeps other media when the cover changes', () => {
    const blob = {ref: 'new'} as never
    const record = applyEventEdits(original, initial, initial, {
      cover: {blob, width: 4, height: 2},
    })
    expect(record.media).toEqual([
      {role: 'gallery', content: {ref: 'other'}},
      {role: 'thumbnail', content: blob, aspect_ratio: {width: 4, height: 2}},
    ])
  })

  it('removes the thumbnail when the cover is removed', () => {
    const record = applyEventEdits(original, initial, initial, {cover: null})
    expect(record.media).toEqual([{role: 'gallery', content: {ref: 'other'}}])
  })

  it('keeps the status, so editing a cancelled event leaves it cancelled', () => {
    const cancelled = {...original, status: `${C}#cancelled`}
    expect(applyEventEdits(cancelled, initial, initial, {}).status).toBe(
      `${C}#cancelled`,
    )
  })

  it('leaves untouched times exactly as stored', () => {
    const local = {
      ...original,
      startsAt: '2027-01-14T19:00:00-05:00',
      endsAt: '2027-01-14T22:00:00-05:00',
    }
    const draft = eventDraftFromRecord(parseEventRecord(local)!, undefined)
    const record = applyEventEdits(local, draft, {...draft, name: 'New'}, {})
    expect(record.startsAt).toBe('2027-01-14T19:00:00-05:00')
    expect(record.endsAt).toBe('2027-01-14T22:00:00-05:00')
  })

  it('does not invent an end when an open-ended event moves earlier', () => {
    const {endsAt: _endsAt, ...open} = original
    const draft = eventDraftFromRecord(parseEventRecord(open)!, undefined)
    const record = applyEventEdits(
      open,
      draft,
      {...draft, startsAt: '2027-01-14T00:00:00.000Z'},
      {},
    )
    expect(record.startsAt).toBe('2027-01-14T00:00:00.000Z')
    expect(record).not.toHaveProperty('endsAt')
  })

  it('does not write a start the event never had', () => {
    const {startsAt: _startsAt, endsAt: _endsAt, ...undated} = original
    const draft = eventDraftFromRecord(parseEventRecord(undated)!, undefined)
    const record = applyEventEdits(undated, draft, {...draft, name: 'New'}, {})
    expect(record).not.toHaveProperty('startsAt')
    expect(record).not.toHaveProperty('endsAt')
  })

  it('applies edits on top of the newer record', () => {
    const newer = {...original, status: `${C}#cancelled`, description: 'Newer'}
    const record = applyEventEdits(
      newer,
      initial,
      {...initial, name: 'Renamed'},
      {},
    )
    expect(record).toMatchObject({
      name: 'Renamed',
      status: `${C}#cancelled`,
      description: 'Newer',
    })
  })

  it("keeps a hybrid event's join link when its place changes", () => {
    const link = {$type: `${C}#uri`, uri: 'https://zoom.us/j/1'}
    const hybrid = {
      ...original,
      mode: `${C}#hybrid`,
      locations: [original.locations[0], link],
    }
    const draft = eventDraftFromRecord(parseEventRecord(hybrid)!, undefined)
    const record = applyEventEdits(
      hybrid,
      draft,
      {...draft, location: 'The Library'},
      {country: 'US'},
    )
    expect(record.mode).toBe(`${C}#hybrid`)
    expect(record.locations).toEqual([
      {
        $type: 'community.lexicon.location.address',
        name: 'The Library',
        country: 'US',
      },
      link,
    ])
  })
})
