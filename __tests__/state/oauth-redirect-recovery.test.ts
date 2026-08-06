/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- test doubles model the untyped Expo OAuth client */
import {
  claimOAuthRedirect,
  completeOAuthRedirect,
  isOAuthCallbackUrl,
  signInNativeAndroid,
} from '#/state/session/oauth-client'

// oauth-client.ts constructs `new ExpoOAuthClient(...)` at module load, which pulls
// the expo native-module chain unavailable under jest.
jest.mock('@atproto/oauth-client-expo', () => ({ExpoOAuthClient: class {}}))

const mockOpenAuthSessionAsync = jest.fn().mockResolvedValue({type: 'dismiss'})
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: any[]) => mockOpenAuthSessionAsync(...a),
}))

let mockUrlHandler: ((e: {url: string}) => void) | null = null
jest.mock('expo-linking', () => ({
  addEventListener: (_evt: string, cb: (e: {url: string}) => void) => {
    mockUrlHandler = cb
    return {remove: jest.fn()}
  },
}))

function makeClient(overrides: Partial<any> = {}) {
  return {
    authorize: jest
      .fn()
      .mockResolvedValue(new URL('https://auth.example/authorize?x=1')),
    callback: jest
      .fn()
      .mockResolvedValue({session: {sub: 'did:plc:abc'}, state: null}),
    ...overrides,
  } as any
}

beforeEach(() => {
  mockUrlHandler = null
  mockOpenAuthSessionAsync.mockClear()
})

// Each test needs a URL no earlier test has claimed — the claim registry is
// module state, mirroring the real single-use-per-process behavior.
let seq = 0
const uniqueRedirect = () =>
  `community.blacksky:/oauth/callback?code=c${seq++}&state=st${seq}`

describe('isOAuthCallbackUrl', () => {
  test('matches both single- and double-slash redirect forms', () => {
    expect(
      isOAuthCallbackUrl('community.blacksky:/oauth/callback?code=a'),
    ).toBe(true)
    expect(
      isOAuthCallbackUrl('community.blacksky://oauth/callback?code=a'),
    ).toBe(true)
  })

  test('rejects other deep-links', () => {
    expect(
      isOAuthCallbackUrl('community.blacksky:/intent/compose?text=hi'),
    ).toBe(false)
    expect(
      isOAuthCallbackUrl('https://blacksky.community/oauth/callback'),
    ).toBe(false)
  })
})

describe('claimOAuthRedirect', () => {
  test('only the first claimant of a URL may exchange it', () => {
    const url = uniqueRedirect()
    expect(claimOAuthRedirect(url)).toBe(true)
    expect(claimOAuthRedirect(url)).toBe(false)
  })

  test('claims are per-URL', () => {
    expect(claimOAuthRedirect(uniqueRedirect())).toBe(true)
    expect(claimOAuthRedirect(uniqueRedirect())).toBe(true)
  })
})

describe('completeOAuthRedirect', () => {
  test('extracts params without new URL() and exchanges them', async () => {
    const client = makeClient()
    const session = await completeOAuthRedirect(
      client,
      'community.blacksky:/oauth/callback?code=xyz&state=st&iss=https%3A%2F%2Fblacksky.app',
    )

    expect(session).toEqual({sub: 'did:plc:abc'})
    const params = client.callback.mock.calls[0][0] as URLSearchParams
    expect(params.get('code')).toBe('xyz')
    expect(params.get('iss')).toBe('https://blacksky.app')
    expect(client.callback.mock.calls[0][1]).toEqual({
      redirect_uri: 'community.blacksky:/oauth/callback',
    })
  })

  test('works on the double-slash form the launcher may deliver', async () => {
    const client = makeClient()
    await completeOAuthRedirect(
      client,
      'community.blacksky://oauth/callback?code=ds&state=st',
    )
    const params = client.callback.mock.calls[0][0] as URLSearchParams
    expect(params.get('code')).toBe('ds')
  })

  test('propagates an exhausted authorization window', async () => {
    const client = makeClient({
      callback: jest.fn().mockRejectedValue(new Error('Unknown state')),
    })
    await expect(
      completeOAuthRedirect(client, uniqueRedirect()),
    ).rejects.toThrow('Unknown state')
  })
})

describe('signInNativeAndroid claim interaction', () => {
  test('claims the redirect so cold-start recovery stands down', async () => {
    const client = makeClient()
    const url = uniqueRedirect()
    const promise = signInNativeAndroid(client, 'alice.test')
    await new Promise(r => setImmediate(r))

    mockUrlHandler!({url})
    await expect(promise).resolves.toEqual({sub: 'did:plc:abc'})

    // The recovery path checks this before exchanging; a second exchange would
    // fail against the now-spent state.
    expect(claimOAuthRedirect(url)).toBe(false)
    expect(client.callback).toHaveBeenCalledTimes(1)
  })

  test('a redirect already claimed elsewhere does not settle the sign-in', async () => {
    const client = makeClient()
    const url = uniqueRedirect()
    expect(claimOAuthRedirect(url)).toBe(true) // e.g. recovery got there first

    const promise = signInNativeAndroid(client, 'alice.test')
    await new Promise(r => setImmediate(r))

    mockUrlHandler!({url})
    await new Promise(r => setImmediate(r))
    expect(client.callback).not.toHaveBeenCalled()

    // Still live, and a fresh redirect completes it.
    const next = uniqueRedirect()
    mockUrlHandler!({url: next})
    await expect(promise).resolves.toEqual({sub: 'did:plc:abc'})
  })
})
