import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {
  parseStandardDocumentUri,
  type StandardDocumentRecord,
} from '#/types/standard-site'
import {fetchRecordViaSlingshot} from './microcosm-fallback'

const RQKEY_ROOT = 'standard-document'
export const RQKEY = (atUri: string) => [RQKEY_ROOT, atUri]

export type StandardDocumentResult = {
  documentUri: string
  document: StandardDocumentRecord
}

export async function fetchStandardDocument(
  atUri: string,
): Promise<StandardDocumentResult | undefined> {
  if (!parseStandardDocumentUri(atUri)) return undefined

  const docRes = await fetchRecordViaSlingshot(atUri)
  if (!docRes?.value) return undefined
  const document = docRes.value as StandardDocumentRecord
  if (typeof document.title !== 'string') return undefined

  return {
    documentUri: atUri,
    document,
  }
}

export function useStandardDocumentQuery(atUri: string | undefined) {
  return useQuery<StandardDocumentResult | undefined>({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(atUri ?? ''),
    queryFn: () => fetchStandardDocument(atUri!),
    enabled: !!atUri && !!parseStandardDocumentUri(atUri),
  })
}
