import {type EventTimeField} from '#/features/events/draft'

export type EventDateRangeProps = {
  startsAt: string
  endsAt: string
  isEndInvalid: boolean
  onChange: (field: EventTimeField, iso: string) => void
}
