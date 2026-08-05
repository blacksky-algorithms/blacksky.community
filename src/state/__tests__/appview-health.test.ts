import {BLUESKY_FALLBACK_PROXY_HEADER, HOME_PROXY_HEADER} from '#/lib/constants'
import {
  isHomeAppviewOutage,
  reportProxiedFetch,
  resetForTesting,
} from '../appview-health'

jest.mock('#/analytics/metrics', () => ({
  metrics: {track: jest.fn()},
}))

const HOME = {headers: {'atproto-proxy': HOME_PROXY_HEADER}}
const FALLBACK = {headers: {'atproto-proxy': BLUESKY_FALLBACK_PROXY_HEADER}}

function fail(init: RequestInit, times: number, status: number | null = 503) {
  for (let i = 0; i < times; i++) reportProxiedFetch(init, status)
}

describe('home appview circuit breaker', () => {
  beforeEach(() => {
    resetForTesting()
  })

  it('trips after 8 consecutive home-bound failures', () => {
    fail(HOME, 7)
    expect(isHomeAppviewOutage()).toBe(false)
    fail(HOME, 1)
    expect(isHomeAppviewOutage()).toBe(true)
  })

  it('network errors (null status) count as failures', () => {
    fail(HOME, 8, null)
    expect(isHomeAppviewOutage()).toBe(true)
  })

  it('4xx responses mean the appview answered — no trip', () => {
    fail(HOME, 20, 400)
    expect(isHomeAppviewOutage()).toBe(false)
  })

  it('a success resets the streak and clears an active outage', () => {
    fail(HOME, 7)
    reportProxiedFetch(HOME, 200)
    fail(HOME, 7)
    expect(isHomeAppviewOutage()).toBe(false)

    fail(HOME, 8)
    expect(isHomeAppviewOutage()).toBe(true)
    reportProxiedFetch(HOME, 200)
    expect(isHomeAppviewOutage()).toBe(false)
  })

  it('ignores fallback-bound and unproxied requests', () => {
    fail(FALLBACK, 20)
    fail({}, 20)
    expect(isHomeAppviewOutage()).toBe(false)
  })

  it('reads the header from Headers instances too', () => {
    const headers = new Headers({'atproto-proxy': HOME_PROXY_HEADER})
    fail({headers}, 8)
    expect(isHomeAppviewOutage()).toBe(true)
  })
})
