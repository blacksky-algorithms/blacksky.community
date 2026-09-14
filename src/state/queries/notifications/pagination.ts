const MAX_AUTO_PAGINATION_ATTEMPTS = 50

export function shouldAutoPaginate({
  hasNextPage,
  itemCount,
  wantedItemCount,
  attemptCount,
}: {
  hasNextPage: boolean
  itemCount: number
  wantedItemCount: number
  attemptCount: number
}): boolean {
  return (
    hasNextPage &&
    itemCount < wantedItemCount &&
    attemptCount < MAX_AUTO_PAGINATION_ATTEMPTS
  )
}

export function nextAutoPaginationAttemptCount({
  attemptCount,
  hasNextPage,
  isLoading,
  isRefetching,
  requestNextPage,
}: {
  attemptCount: number
  hasNextPage: boolean
  isLoading: boolean
  isRefetching: boolean
  requestNextPage: boolean
}): number {
  if (isLoading || isRefetching || !hasNextPage) return 0
  return requestNextPage ? attemptCount + 1 : attemptCount
}
