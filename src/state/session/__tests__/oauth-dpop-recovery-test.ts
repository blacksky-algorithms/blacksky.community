import {describe, expect, it, jest} from '@jest/globals'

import {fetchWithDpopRetry} from '../oauth-dpop-recovery'

const URL = 'https://pds.example.com/xrpc/app.bsky.feed.getTimeline'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

function dpopError(message: string) {
  return jsonResponse(401, {error: 'invalid_dpop_proof', message})
}

function mockHandler(...responses: Response[]) {
  const handler =
    jest.fn<(url: string, init: RequestInit) => Promise<Response>>()
  for (const res of responses) handler.mockResolvedValueOnce(res)
  return handler
}

describe('fetchWithDpopRetry', () => {
  it.each([
    'DPoP proof is too old',
    'DPoP proof "jti" replayed',
    'DPoP proof replayed',
    'Failed to verify DPoP proof: "iat" claim timestamp check failed (too far in the past)',
  ])('retries a GET once after "%s" and returns the retry', async message => {
    const handler = mockHandler(dpopError(message), jsonResponse(200, {ok: 1}))
    const init = {method: 'GET', headers: {'atproto-proxy': 'x'}}

    const res = await fetchWithDpopRetry(handler, URL, init)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ok: 1})
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(2, URL, init)
  })

  it('treats an omitted method as GET and retries HEAD', async () => {
    const omitted = mockHandler(
      dpopError('DPoP proof is too old'),
      jsonResponse(200, {}),
    )
    await fetchWithDpopRetry(omitted, URL, {})
    expect(omitted).toHaveBeenCalledTimes(2)

    const head = mockHandler(
      dpopError('DPoP proof is too old'),
      jsonResponse(200, {}),
    )
    await fetchWithDpopRetry(head, URL, {method: 'head'})
    expect(head).toHaveBeenCalledTimes(2)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'never retries %s',
    async method => {
      const handler = mockHandler(dpopError('DPoP proof is too old'))

      const res = await fetchWithDpopRetry(handler, URL, {method})

      expect(res.status).toBe(401)
      expect(handler).toHaveBeenCalledTimes(1)
    },
  )

  it('surfaces a second failure without a third attempt', async () => {
    const handler = mockHandler(
      dpopError('DPoP proof is too old'),
      dpopError('DPoP proof is too old'),
      jsonResponse(200, {}),
    )

    const res = await fetchWithDpopRetry(handler, URL, {method: 'GET'})

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: 'invalid_dpop_proof',
      message: 'DPoP proof is too old',
    })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['another DPoP error', dpopError('DPoP "htm" mismatch')],
    [
      'invalid_token',
      jsonResponse(401, {error: 'invalid_token', message: 'expired'}),
    ],
    ['a non-JSON body', new Response('nope', {status: 401})],
  ])('does not retry %s and leaves the body readable', async (_, first) => {
    const handler = mockHandler(first)

    const res = await fetchWithDpopRetry(handler, URL, {method: 'GET'})

    expect(res.status).toBe(401)
    await expect(res.text()).resolves.toBeTruthy()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not retry an aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    const handler = mockHandler(dpopError('DPoP proof is too old'))

    await fetchWithDpopRetry(handler, URL, {signal: controller.signal})

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes non-401 responses through untouched', async () => {
    const handler = mockHandler(jsonResponse(500, {error: 'InternalError'}))

    const res = await fetchWithDpopRetry(handler, URL, {method: 'GET'})

    expect(res.status).toBe(500)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
