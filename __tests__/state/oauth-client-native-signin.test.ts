/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- test doubles model the untyped Expo OAuth client */
import {signInNativeAndroid} from '#/state/session/oauth-client'

// --- mocks ---
// oauth-client.ts constructs `new ExpoOAuthClient(...)` at module load, which pulls
// the expo native-module chain unavailable under jest. signInNativeAndroid takes its
// client as a parameter, so stub the package to keep the import hermetic.
jest.mock('@atproto/oauth-client-expo', () => ({ExpoOAuthClient: class {}}))

const mockOpenAuthSessionAsync = jest.fn().mockResolvedValue({type: 'dismiss'})
const mockDismissBrowser = jest.fn().mockResolvedValue(undefined)
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: any[]) => mockOpenAuthSessionAsync(...a),
  dismissBrowser: (...a: any[]) => mockDismissBrowser(...a),
}))

let mockUrlHandler: ((e: {url: string}) => void) | null = null
const mockRemoveSub = jest.fn()
jest.mock('expo-linking', () => ({
  addEventListener: (_evt: string, cb: (e: {url: string}) => void) => {
    mockUrlHandler = cb
    return {remove: mockRemoveSub}
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
  mockRemoveSub.mockClear()
})

const REDIRECT = 'community.blacksky:/oauth/callback'

test('completes via redirect deep-link, ignoring the browser dismiss', async () => {
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')

  await new Promise(r => setImmediate(r))
  expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1)
  expect(mockUrlHandler).toBeTruthy()

  mockUrlHandler!({url: `${REDIRECT}?code=xyz&state=st`})

  const session = await promise
  expect(session).toEqual({sub: 'did:plc:abc'})
  expect(client.callback).toHaveBeenCalledTimes(1)
  const params = client.callback.mock.calls[0][0] as URLSearchParams
  expect(params.get('code')).toBe('xyz')
  expect(mockRemoveSub).toHaveBeenCalled()
})

test('ignores unrelated deep-links', async () => {
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')
  await new Promise(r => setImmediate(r))

  mockUrlHandler!({url: 'community.blacksky:/intent/compose?text=hi'})
  expect(client.callback).not.toHaveBeenCalled()

  mockUrlHandler!({url: `${REDIRECT}?code=ok&state=st`})
  await expect(promise).resolves.toEqual({sub: 'did:plc:abc'})
})

test('rejects and removes the listener when aborted', async () => {
  const client = makeClient()
  const controller = new AbortController()
  const promise = signInNativeAndroid(client, 'alice.test', {
    signal: controller.signal,
  })
  await new Promise(r => setImmediate(r))

  controller.abort()
  await expect(promise).rejects.toThrow('OAUTH_CANCELLED')
  expect(mockRemoveSub).toHaveBeenCalled()
  expect(client.callback).not.toHaveBeenCalled()
})

test('surfaces an error redirect (Kind 2) via callback throwing', async () => {
  const client = makeClient({
    callback: jest.fn().mockRejectedValue(new Error('access_denied')),
  })
  const promise = signInNativeAndroid(client, 'alice.test')
  await new Promise(r => setImmediate(r))

  mockUrlHandler!({url: `${REDIRECT}?error=access_denied&state=st`})
  await expect(promise).rejects.toThrow('access_denied')
})

test('completes via a double-slash redirect deep-link', async () => {
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')
  await new Promise(r => setImmediate(r))

  mockUrlHandler!({url: 'community.blacksky://oauth/callback?code=ds&state=st'})

  const session = await promise
  expect(session).toEqual({sub: 'did:plc:abc'})
  expect(client.callback).toHaveBeenCalledTimes(1)
  const params = client.callback.mock.calls[0][0] as URLSearchParams
  expect(params.get('code')).toBe('ds')
})

test('rejects (no hang) when the browser fails to launch', async () => {
  mockOpenAuthSessionAsync.mockRejectedValueOnce(new Error('no browser'))
  const client = makeClient()
  const promise = signInNativeAndroid(client, 'alice.test')

  // No redirect is ever delivered; the flow must still settle via the launch error.
  await expect(promise).rejects.toThrow('no browser')
  expect(client.callback).not.toHaveBeenCalled()
})
