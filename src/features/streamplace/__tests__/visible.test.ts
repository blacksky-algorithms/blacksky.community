
import {type ModerationOpts} from '@bsky/sdk/moderation'
import {visibleMessages} from '../visible'
import {type app} from '#/lexicons'

jest.mock('@bsky/sdk/moderation', () => ({
  ...jest.requireActual('@bsky/sdk/moderation'),
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
const profile = (did: string) =>
  ({did, handle: did}) as app.bsky.actor.defs.ProfileViewDetailed

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
