import {useCallback, useMemo} from 'react'
import {Trans} from '@lingui/react/macro'

import {isSpaceBackedFeed} from '#/lib/api/community-feed'
import {useRequireEmailVerification} from '#/lib/hooks/useRequireEmailVerification'
import {useCommunityPostTargets} from '#/state/queries/community-post-targets'
import {type FeedDescriptor} from '#/state/queries/post-feed'
import {
  type ComposerOpts,
  useOpenComposer as useRootOpenComposer,
} from '#/state/shell/composer'

export function useOpenComposer(contextualFeed?: FeedDescriptor) {
  const {openComposer: rootOpenComposer} = useRootOpenComposer()
  const requireEmailVerification = useRequireEmailVerification()
  const {data: postTargets, refetch: refetchPostTargets} =
    useCommunityPostTargets(contextualFeed)
  const openComposer = useCallback(
    (opts: ComposerOpts) => {
      if (!contextualFeed || opts.replyTo || opts.quote) {
        rootOpenComposer(opts)
        return
      }

      const openWithTargets = (
        availableTargets: NonNullable<typeof postTargets>,
      ) => {
        const contextualCommunityFeedTarget = availableTargets.find(
          target =>
            `feedgen|${target.feed}` === contextualFeed &&
            isSpaceBackedFeed(target.config),
        )

        rootOpenComposer(
          contextualCommunityFeedTarget
            ? {...opts, contextualCommunityFeedTarget}
            : opts,
        )
      }

      if (postTargets) {
        openWithTargets(postTargets)
      } else {
        void refetchPostTargets().then(result => {
          openWithTargets(result.data ?? [])
        })
      }
    },
    [contextualFeed, postTargets, refetchPostTargets, rootOpenComposer],
  )

  return useMemo(() => {
    return {
      openComposer: requireEmailVerification(openComposer, {
        instructions: [
          <Trans key="pre-compose">
            Before creating a post or replying, you must first verify your
            email.
          </Trans>,
        ],
      }),
    }
  }, [openComposer, requireEmailVerification])
}
