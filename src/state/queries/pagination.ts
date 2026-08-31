export function getNextCursor(
  cursor: string | undefined,
  pageParams: readonly (string | undefined)[],
) {
  return cursor && !pageParams.includes(cursor) ? cursor : undefined
}

export function dedupeBy<T>(items: readonly T[], getKey: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = getKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
