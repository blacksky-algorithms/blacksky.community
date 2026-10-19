import {type MessageDescriptor} from '@lingui/core'
import {msg} from '@lingui/core/macro'

export type MidtermsCta = {
  title: MessageDescriptor
  description: MessageDescriptor
  url: string
}

export const GRAZE_PARTNER = {
  name: 'Graze',
}

export const MIDTERMS_CTAS: MidtermsCta[] = [
  {
    title: msg`Host a watch party`,
    description: msg`Stream the results with people near you. Anyone can host one.`,
    url: 'https://midterms.graze.social/#join',
  },
  {
    title: msg`Help run the feeds`,
    description: msg`Fifty state feeds is more than a few people can watch on election night. Offer to help moderate one. Volunteers get an Uncle Sam hat on rpg.actor.`,
    url: 'https://midterms.graze.social/#join',
  },
]
