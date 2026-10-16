const RETRYABLE_METHODS = new Set(['GET', 'HEAD'])

const RETRYABLE_DPOP_MESSAGES = new Set([
  'DPoP proof is too old',
  'DPoP proof "jti" replayed',
  'DPoP proof replayed',
  'Failed to verify DPoP proof: "iat" claim timestamp check failed (too far in the past)',
])

// A proof can be rejected as stale or replayed when the OS delays or resends a
// request. Reads are retried once with a fresh proof; writes never are, since
// the original may have already been applied.
export async function fetchWithDpopRetry(
  fetchHandler: (url: string, init: RequestInit) => Promise<Response>,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetchHandler(url, init)
  if (res.status !== 401) return res
  const method = (init.method ?? 'GET').toUpperCase()
  if (!RETRYABLE_METHODS.has(method) || init.signal?.aborted) return res
  if (!(await isRetryableDpopError(res))) return res
  res.body?.cancel().catch(() => {})
  return fetchHandler(url, init)
}

async function isRetryableDpopError(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as {
      error?: unknown
      message?: unknown
    } | null
    return (
      body?.error === 'invalid_dpop_proof' &&
      typeof body.message === 'string' &&
      RETRYABLE_DPOP_MESSAGES.has(body.message)
    )
  } catch {
    return false
  }
}
