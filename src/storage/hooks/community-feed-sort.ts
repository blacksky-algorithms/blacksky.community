import {useSession} from '#/state/session'
import {account, useStorage} from '#/storage'

export function useCommunityFeedSort() {
  const {currentAccount} = useSession()
  const [sort = 'recent', setSort] = useStorage(account, [
    currentAccount?.did ?? '',
    'communityFeedSort',
  ])

  return [sort, setSort] as const
}
