/**
 * Narrow the domains a PDS advertises down to the ones the selected community
 * publishes.
 *
 * Falls back to every advertised domain in two cases:
 *
 * - `allowed` is empty or missing — the community's config hasn't loaded or
 *   couldn't be fetched, so there is no restriction to apply.
 * - Nothing intersects — the community and the PDS disagree, which happens when
 *   the hosting provider is switched after a community is picked (the two are
 *   tracked in separate state). The PDS is the authority on what it accepts.
 *
 * Either way the PDS's own list wins over an empty handle step: an extra domain
 * on offer is cheaper to correct than a signup the user has to restart.
 */
export function filterUserDomains(
  domains: string[],
  allowed?: string[],
): string[] {
  if (!allowed || allowed.length === 0) return domains

  const filtered = domains.filter(domain => allowed.includes(domain))

  return filtered.length > 0 ? filtered : domains
}
