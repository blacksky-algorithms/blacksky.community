import {visibleMessages} from '../visible'

jest.mock('@atproto/api', () => ({
  ...jest.requireActual('@atproto/api'),
  moderateProfile: (p: {did: string}) => ({
    ui: () => ({filter: p.did === 'did:muted'}),
  }),
}))

const m = (did: string) => ({uri: `at://${did}/1`, authorDid: did, handle: did, text: 'x', createdAt: ''})
const profile = (did: string) => ({did, handle: did}) as any

it('hides unknown and filtered authors', () => {
  const profiles = new Map([
    ['did:ok', profile('did:ok')],
    ['did:muted', profile('did:muted')],
  ])
  const out = visibleMessages([m('did:ok'), m('did:muted'), m('did:unknown')], profiles, {} as any)
  expect(out.map(x => x.message.authorDid)).toEqual(['did:ok'])
})
