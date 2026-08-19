/**
 * Narrow the domains a PDS advertises down to the ones the selected community
 * publishes.
 *
 * An empty or missing `allowed` means "no community restriction known" — the
 * community's config hasn't loaded or couldn't be fetched — so every advertised
 * domain stays selectable. Signup continuing with an extra domain on offer
 * beats blocking it on a brand-service failure.
 */
export function filterUserDomains(
  domains: string[],
  allowed?: string[],
): string[] {
  if (!allowed || allowed.length === 0) return domains

  return domains.filter(domain => allowed.includes(domain))
}
