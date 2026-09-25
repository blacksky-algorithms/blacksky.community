import {type ModerationOpts} from '@atproto/api'

import {visibleMessages} from '../visible'

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  moderateProfile: (p: {did: string}) => ({
    ui: () => ({filter: p.did === 'did:muted', blur: p.did === 'did:warned'}),
  }),
}))

const m = (did: string) => ({
  uri: `at://${did}/1`,
  authorDid: did,
  handle: did,
  text: 'x',
  indexedAt: '',
})
const profile = (did: string) => ({did, handle: did})

it('hides unknown, filtered and blurred authors', () => {
  const profiles = new Map([
    ['did:ok', profile('did:ok')],
    ['did:muted', profile('did:muted')],
    ['did:warned', profile('did:warned')],
  ])
  const out = visibleMessages(
    [m('did:ok'), m('did:muted'), m('did:warned'), m('did:unknown')],
    profiles,
    {} as ModerationOpts,
  )
  expect(out.map(x => x.message.authorDid)).toEqual(['did:ok'])
})
