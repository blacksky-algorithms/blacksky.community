import {cleanError} from '../errors'

const INTERRUPTED = 'Connection was interrupted. Please try again.'

it.each([
  'XRPCError: DPoP proof is too old',
  'Failed to verify DPoP proof: "iat" claim timestamp check failed (too far in the past)',
])('maps "%s" to a connection-interrupted message', error => {
  expect(cleanError(error)).toBe(INTERRUPTED)
})

it.each([
  'XRPCError: DPoP proof replayed',
  'XRPCError: DPoP proof "jti" replayed',
])('does not invite a resubmit for "%s"', error => {
  expect(cleanError(error)).not.toBe(INTERRUPTED)
})

it('no longer blames the device clock', () => {
  expect(cleanError('invalid_dpop_proof: iat claim')).not.toMatch(/clock/i)
})

it('keeps the generic message for other DPoP proof errors', () => {
  expect(cleanError('invalid_dpop_proof: DPoP "htm" mismatch')).toBe(
    'Authentication error. Please try signing in again.',
  )
})
