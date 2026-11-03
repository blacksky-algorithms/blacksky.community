import {
  areEventDetailsValid,
  createEventDraft,
  EVENT_DESCRIPTION_MAX_GRAPHEMES,
  EVENT_NAME_MAX_GRAPHEMES,
  type EventDraft,
  eventEndsBeforeStart,
  eventStartsInPast,
  isEventDraftPublishable,
} from '../draft'

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
})
