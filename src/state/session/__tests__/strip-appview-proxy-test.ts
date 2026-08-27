import {describe, expect, it} from '@jest/globals'

import {stripAppviewProxyForPdsLocalMethods} from '../agent'

const PROXY = 'atproto-proxy'
const PROXY_VALUE = 'did:web:api.blacksky.community#bsky_appview'

function getInit(headers: Record<string, string>): RequestInit {
  return {method: 'GET', headers}
}

function headerValue(
  init: RequestInit | undefined,
  name: string,
): string | null {
  return new Headers(init?.headers).get(name)
}

const GET_PREFS = 'https://pds.example.com/xrpc/app.bsky.actor.getPreferences'
const PUT_PREFS = 'https://pds.example.com/xrpc/app.bsky.actor.putPreferences'
const TIMELINE = 'https://pds.example.com/xrpc/app.bsky.feed.getTimeline'
const SPACE_CREATE =
  'https://pds.example.com/xrpc/com.atproto.space.createRecord'
const SPACE_DELETE =
  'https://pds.example.com/xrpc/com.atproto.space.deleteRecord'
const SPACE_GET = 'https://pds.example.com/xrpc/com.atproto.space.getRecord'
const SPACE_OTHER = 'https://pds.example.com/xrpc/com.atproto.space.listRecords'

describe('stripAppviewProxyForPdsLocalMethods', () => {
  it('strips the appview proxy header on getPreferences', () => {
    const out = stripAppviewProxyForPdsLocalMethods(
      GET_PREFS,
      getInit({[PROXY]: PROXY_VALUE, authorization: 'Bearer tok'}),
    )
    expect(headerValue(out, PROXY)).toBeNull()
  })

  it('strips the appview proxy header on putPreferences', () => {
    const out = stripAppviewProxyForPdsLocalMethods(
      PUT_PREFS,
      getInit({[PROXY]: PROXY_VALUE}),
    )
    expect(headerValue(out, PROXY)).toBeNull()
  })

  it('preserves other headers (e.g. authorization) while stripping the proxy header', () => {
    const out = stripAppviewProxyForPdsLocalMethods(
      GET_PREFS,
      getInit({[PROXY]: PROXY_VALUE, authorization: 'Bearer tok'}),
    )
    expect(headerValue(out, PROXY)).toBeNull()
    expect(headerValue(out, 'authorization')).toBe('Bearer tok')
  })

  it('leaves the proxy header intact for non-exempt methods', () => {
    const init = getInit({[PROXY]: PROXY_VALUE})
    const out = stripAppviewProxyForPdsLocalMethods(TIMELINE, init)
    // Non-exempt: init is returned untouched.
    expect(out).toBe(init)
    expect(headerValue(out, PROXY)).toBe(PROXY_VALUE)
  })

  it('accepts a URL instance as input', () => {
    const out = stripAppviewProxyForPdsLocalMethods(
      new URL(GET_PREFS),
      getInit({[PROXY]: PROXY_VALUE}),
    )
    expect(headerValue(out, PROXY)).toBeNull()
  })

  it.each([SPACE_CREATE, SPACE_DELETE, SPACE_GET])(
    'strips the appview proxy header on %s',
    url => {
      const out = stripAppviewProxyForPdsLocalMethods(
        url,
        getInit({[PROXY]: PROXY_VALUE, authorization: 'DPoP tok'}),
      )
      expect(headerValue(out, PROXY)).toBeNull()
      expect(headerValue(out, 'authorization')).toBe('DPoP tok')
    },
  )

  it('does not strip unlisted space methods', () => {
    const init = getInit({[PROXY]: PROXY_VALUE})
    const out = stripAppviewProxyForPdsLocalMethods(SPACE_OTHER, init)
    expect(out).toBe(init)
    expect(headerValue(out, PROXY)).toBe(PROXY_VALUE)
  })
})
