import {
  areEventDetailsValid,
  buildEventExternal,
  buildEventRecord,
  changeEventTime,
  createEventDraft,
  EVENT_DESCRIPTION_MAX_GRAPHEMES,
  EVENT_NAME_MAX_GRAPHEMES,
  type EventDraft,
  eventEndsBeforeStart,
  eventStartsInPast,
  fromLocalInputValue,
  isEventDraftPublishable,
  toLocalInputValue,
} from '../draft'
import {parseEventRecord} from '../record'

const NOW = new Date('2027-01-15T11:05:42.123Z')

function draft(fields: Partial<EventDraft> = {}): EventDraft {
  return {...createEventDraft(NOW), name: 'Party', ...fields}
}

describe('event drafts', () => {
  it('starts and ends at the current minute', () => {
    expect(createEventDraft(NOW)).toMatchObject({
      step: 'details',
      startsAt: '2027-01-15T11:05:00.000Z',
      endsAt: '2027-01-15T11:05:00.000Z',
    })
  })

  describe('areEventDetailsValid', () => {
    it('needs a name that is not blank', () => {
      expect(areEventDetailsValid(draft())).toBe(true)
      expect(areEventDetailsValid(draft({name: '  '}))).toBe(false)
    })

    it('counts graphemes, not characters, against the name limit', () => {
      expect(
        areEventDetailsValid(
          draft({name: '🎉'.repeat(EVENT_NAME_MAX_GRAPHEMES)}),
        ),
      ).toBe(true)
      expect(
        areEventDetailsValid(
          draft({name: 'a'.repeat(EVENT_NAME_MAX_GRAPHEMES + 1)}),
        ),
      ).toBe(false)
    })

    it('limits the description', () => {
      expect(
        areEventDetailsValid(
          draft({
            description: 'a'.repeat(EVENT_DESCRIPTION_MAX_GRAPHEMES + 1),
          }),
        ),
      ).toBe(false)
    })
  })

  it('flags an end before the start, but not an equal one', () => {
    expect(eventEndsBeforeStart(draft())).toBe(false)
    expect(
      eventEndsBeforeStart(draft({endsAt: '2027-01-15T11:04:00.000Z'})),
    ).toBe(true)
  })

  it('warns about a past start only beyond the grace window', () => {
    const now = NOW.getTime()
    expect(eventStartsInPast(draft(), now + 14 * 60e3)).toBe(false)
    expect(eventStartsInPast(draft(), now + 16 * 60e3)).toBe(true)
  })

  it('is publishable once finished with valid details and times', () => {
    expect(isEventDraftPublishable(draft())).toBe(false)
    expect(isEventDraftPublishable(draft({step: 'done'}))).toBe(true)
    expect(
      isEventDraftPublishable(
        draft({step: 'done', endsAt: '2027-01-15T11:00:00.000Z'}),
      ),
    ).toBe(false)
  })

  describe('changeEventTime', () => {
    it('moves the end along when the start passes it', () => {
      expect(
        changeEventTime(draft(), 'startsAt', '2027-01-16T10:00:00.000Z'),
      ).toEqual({
        startsAt: '2027-01-16T10:00:00.000Z',
        endsAt: '2027-01-16T10:00:00.000Z',
      })
    })

    it('leaves a later end alone', () => {
      const later = draft({endsAt: '2027-01-20T10:00:00.000Z'})
      expect(
        changeEventTime(later, 'startsAt', '2027-01-16T10:00:00.000Z'),
      ).toEqual({startsAt: '2027-01-16T10:00:00.000Z'})
    })

    it('lets the end go before the start, for validation to catch', () => {
      expect(
        changeEventTime(draft(), 'endsAt', '2027-01-14T10:00:00.000Z'),
      ).toEqual({endsAt: '2027-01-14T10:00:00.000Z'})
    })
  })

  it('round-trips local input values', () => {
    const iso = '2027-01-15T11:05:00.000Z'
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso)
    expect(fromLocalInputValue('')).toBeUndefined()
  })

  describe('buildEventRecord', () => {
    const opts = {now: NOW, timeZone: 'America/New_York', country: 'US'}

    it('writes the minimal record', () => {
      expect(buildEventRecord(draft({name: ' Party '}), opts)).toEqual({
        $type: 'community.lexicon.calendar.event',
        name: 'Party',
        createdAt: NOW.toISOString(),
        startsAt: '2027-01-15T11:05:00.000Z',
        status: 'community.lexicon.calendar.event#scheduled',
        timezone: 'America/New_York',
      })
    })

    it('keeps a distinct end and a trimmed description', () => {
      const record = buildEventRecord(
        draft({
          endsAt: '2027-01-15T14:00:00.000Z',
          description: '  Bring snacks ',
        }),
        opts,
      )
      expect(record).toMatchObject({
        endsAt: '2027-01-15T14:00:00.000Z',
        description: 'Bring snacks',
      })
    })

    it('makes a link location an online event that our card can join', () => {
      const record = buildEventRecord(
        draft({location: 'https://twitch.tv/someone'}),
        opts,
      )
      expect(record).toMatchObject({
        mode: 'community.lexicon.calendar.event#virtual',
        locations: [
          {
            $type: 'community.lexicon.calendar.event#uri',
            uri: 'https://twitch.tv/someone',
          },
        ],
      })
      expect(parseEventRecord(record)?.joinUrl).toBe(
        'https://twitch.tv/someone',
      )
    })

    it.each(['zoom.us/j/123', 'meet.google.com/abc-defg-hij', 'twitch.tv'])(
      'treats the bare domain %s as an online link',
      location => {
        expect(buildEventRecord(draft({location}), opts)).toMatchObject({
          mode: 'community.lexicon.calendar.event#virtual',
          locations: [{uri: `https://${location}`}],
        })
      },
    )

    it.each(['Prospect Park', 'St. Mark’s Church', 'Room 4.2'])(
      'keeps %s as a place',
      location => {
        expect(buildEventRecord(draft({location}), opts)).toMatchObject({
          mode: 'community.lexicon.calendar.event#inperson',
        })
      },
    )

    it('makes a place an in-person address our card can show', () => {
      const record = buildEventRecord(draft({location: 'Prospect Park'}), opts)
      expect(record).toMatchObject({
        mode: 'community.lexicon.calendar.event#inperson',
        locations: [
          {
            $type: 'community.lexicon.location.address',
            name: 'Prospect Park',
            country: 'US',
          },
        ],
      })
      expect(parseEventRecord(record)?.location).toBe('Prospect Park')
    })

    it('stores a cover as the thumbnail media', () => {
      const blob = {ref: {$link: 'bafkreicover'}} as never
      expect(
        buildEventRecord(draft(), {
          ...opts,
          cover: {blob, width: 1500, height: 500},
        }).media,
      ).toEqual([
        {
          role: 'thumbnail',
          content: blob,
          aspect_ratio: {width: 1500, height: 500},
        },
      ])
    })

    it('keeps a place when the country is unknown', () => {
      const record = buildEventRecord(draft({location: 'Prospect Park'}), {
        now: NOW,
      })
      expect(record).toMatchObject({
        mode: 'community.lexicon.calendar.event#inperson',
        locations: [{name: 'Prospect Park', country: 'ZZ'}],
      })
      expect(record).not.toHaveProperty('timezone')
      expect(parseEventRecord(record)?.location).toBe('Prospect Park')
    })
  })

  it('links the post to the event page by DID', () => {
    expect(
      buildEventExternal(draft({location: 'The park'}), {
        did: 'did:plc:alice',
        rkey: '3kevent',
        locale: 'en-US',
      }),
    ).toEqual({
      uri: 'https://blacksky.community/event/did:plc:alice/3kevent',
      title: 'Party',
      description: expect.stringContaining(' · The park'),
    })
  })
})
