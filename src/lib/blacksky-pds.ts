/**
 * Returns the gatekeeper base URL for a given PDS service URL.
 * The gatekeeper runs behind the same Caddy reverse proxy, so
 * the base URL is the same as the PDS service URL.
 */
export function getGatekeeperUrl(serviceUrl: string): string {
  // Strip trailing slash
  return serviceUrl.replace(/\/+$/, '')
}
