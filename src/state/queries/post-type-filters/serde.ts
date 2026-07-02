import {KNOWN_TYPES} from './client-map'
import {
  POST_TYPE_FILTER_NSID,
  type AuthorFilter,
  type PostTypeFiltersRecord,
} from './types'

export type FilterOp =
  | {op: 'add'; subject: string; type: string}
  | {op: 'remove'; subject: string; type: string}

function isKnownType(t: string): t is (typeof KNOWN_TYPES)[number] {
  return (KNOWN_TYPES as readonly string[]).includes(t)
}

function findIndex(
  filters: readonly AuthorFilter[],
  subject: string,
): number {
  return filters.findIndex(f => f.subject === subject)
}

function dedupeTypes(types: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of types) {
    if (!seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

export function addFilter(
  prev: readonly AuthorFilter[] | null | undefined,
  subject: string,
  type: string,
  now: string,
): AuthorFilter[] {
  if (!isKnownType(type)) return prev ? [...prev] : []
  const i = findIndex(prev ?? [], subject)
  if (i === -1) {
    const base = prev ? [...prev] : []
    base.push({subject, types: [type], createdAt: now, updatedAt: now})
    return base
  }
  const existing = (prev as AuthorFilter[])[i]
  if (existing.types.includes(type)) return prev as AuthorFilter[]
  const base = [...(prev as AuthorFilter[])]
  base[i] = {
    ...existing,
    types: dedupeTypes([...existing.types, type]),
    updatedAt: now,
  }
  return base
}

export function removeFilter(
  prev: readonly AuthorFilter[] | null | undefined,
  subject: string,
  type: string,
): AuthorFilter[] {
  if (!prev) return []
  const i = findIndex(prev, subject)
  if (i === -1) return prev as AuthorFilter[]
  const existing = prev[i]
  const nextTypes = existing.types.filter(t => t !== type)
  if (nextTypes.length === existing.types.length) {
    return prev as AuthorFilter[]
  }
  const base = [...prev]
  if (nextTypes.length === 0) {
    base.splice(i, 1)
    return base
  }
  base[i] = {...existing, types: nextTypes}
  return base
}

export function applyOp(
  prev: readonly AuthorFilter[] | null | undefined,
  op: FilterOp,
  now: string,
): AuthorFilter[] {
  if (op.op === 'add') {
    return addFilter(prev, op.subject, op.type, now)
  }
  return removeFilter(prev, op.subject, op.type)
}

/**
 * Builds the next record from the cached one and an op.
 *
 * Returns `null` when the mutation should be a network no-op:
 *  - `prev` is `null` (no record exists) and the next filter list is empty.
 *
 * Callers must dispatch on the return: non-null → `putRecord`, null when
 * `prev` was non-null → `deleteRecord`, null when `prev` was `null` → no-op.
 */
export function buildRecord(
  prev: PostTypeFiltersRecord | null | undefined,
  op: FilterOp,
  now: string = new Date().toISOString(),
): {action: 'put' | 'delete' | 'noop'; record: PostTypeFiltersRecord} {
  const nextFilters = applyOp(prev?.filters, op, now)
  if (nextFilters.length === 0) {
    if (!prev) return {action: 'noop', record: emptyRecord()}
    return {
      action: 'delete',
      record: emptyRecord(),
    }
  }
  return {
    action: 'put',
    record: {
      $type: POST_TYPE_FILTER_NSID,
      filters: nextFilters,
      updatedAt: now,
    },
  }
}

function emptyRecord(): PostTypeFiltersRecord {
  return {$type: POST_TYPE_FILTER_NSID, filters: []}
}
