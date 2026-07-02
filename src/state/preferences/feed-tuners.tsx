import {useMemo} from 'react'

import {FeedTuner, type FeedTunerFn} from '#/lib/api/feed-manip'
import {type FeedDescriptor} from '../queries/post-feed'
import {usePreferencesQuery} from '../queries/preferences'
import {useSession} from '../session'
import {
  isQuoteFilter,
  isRepostFilter,
} from '../queries/post-type-filters/client-map'
import {usePostTypeFiltersQuery} from '../queries/post-type-filters'
import {useLanguagePrefs} from './languages'

export function useFeedTuners(feedDesc: FeedDescriptor) {
  const langPrefs = useLanguagePrefs()
  const {data: preferences} = usePreferencesQuery()
  const {data: postTypeFilters} = usePostTypeFiltersQuery()
  const {currentAccount} = useSession()

  return useMemo(() => {
    let feedTuners: FeedTunerFn[] = []

    if (feedDesc.startsWith('author')) {
      if (feedDesc.endsWith('|posts_with_replies')) {
        // TODO: Do this on the server instead.
        feedTuners = [FeedTuner.removeReposts]
      }
    } else if (feedDesc.startsWith('feedgen')) {
      feedTuners = [
        FeedTuner.preferredLangOnly(langPrefs.contentLanguages),
        FeedTuner.removeMutedThreads,
      ]
    } else if (feedDesc === 'following' || feedDesc.startsWith('list')) {
      feedTuners = [FeedTuner.removeOrphans]

      if (preferences?.feedViewPrefs.hideReposts) {
        feedTuners.push(FeedTuner.removeReposts)
      }
      if (preferences?.feedViewPrefs.hideReplies) {
        feedTuners.push(FeedTuner.removeReplies)
      } else {
        feedTuners.push(
          FeedTuner.followedRepliesOnly({
            userDid: currentAccount?.did || '',
          }),
        )
      }
      if (preferences?.feedViewPrefs.hideQuotePosts) {
        feedTuners.push(FeedTuner.removeQuotePosts)
      }
      feedTuners.push(FeedTuner.dedupThreads)
      feedTuners.push(FeedTuner.removeMutedThreads)
    }

    // Per-account post-type filters apply to every feed descriptor.
    // Independent of the PDS-stored feedViewPrefs above (which is global).
    if (postTypeFilters?.filters) {
      for (const f of postTypeFilters.filters) {
        if (isRepostFilter(f.types)) {
          feedTuners.push(FeedTuner.removeAuthorReposts({did: f.subject}))
        }
        if (isQuoteFilter(f.types)) {
          feedTuners.push(FeedTuner.removeAuthorQuotePosts({did: f.subject}))
        }
      }
    }

    return feedTuners
  }, [feedDesc, currentAccount, preferences, langPrefs, postTypeFilters])
}
