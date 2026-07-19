import {getAge} from '#/lib/strings/time'

/**
 * Whether the user's self-declared birthdate places them under 18.
 *
 * Declared age only - we do not perform any third-party age verification.
 * Returns false when no birthdate is known: this is a deliberate permissive
 * default. Signup already enforces a 13+ minimum, and normal (OAuth) sessions
 * reliably expose birthDate via getPreferences; a missing birthdate is a rare
 * legacy/app-password case where we prefer not to block otherwise-adult users.
 */
export function isDeclaredUnder18(birthDate?: Date): boolean {
  if (!birthDate) return false
  return getAge(birthDate) < 18
}

/**
 * Whether adult content must be blocked for this user.
 *
 * Phase 1 (current): declared age only - blocked iff the user declares an age
 * under 18. This function is the seam for later per-jurisdiction verification:
 * a future phase can additionally block unverified users in regions that
 * require verified (not merely declared) age, gated behind a feature flag using
 * the countryCode/regionCode attributes already set in the analytics/features
 * (GrowthBook) provider. Keeping the decision here means callers never change.
 */
export function adultContentAgeBlocked(birthDate?: Date): boolean {
  return isDeclaredUnder18(birthDate)
}
