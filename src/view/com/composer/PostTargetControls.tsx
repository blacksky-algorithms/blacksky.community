import {Trans, useLingui} from '@lingui/react/macro'

import {type CommunityFeedTarget} from '#/lib/api/community-feed'
import {
  type ComposerAction,
  type ThreadDraft,
} from '#/view/com/composer/state/composer'
import {atoms as a} from '#/alf'
import * as Toggle from '#/components/forms/Toggle'

export function PostTargetControls({
  thread,
  dispatch,
  isCommunityMember,
  homeAppviewOutage,
  setBlackskyOnlyDefault,
  isReply,
  isForcedBlackskyOnly,
  isForcedCommunityTarget,
  contextualCommunityFeedTarget,
}: {
  thread: ThreadDraft
  dispatch: (action: ComposerAction) => void
  isCommunityMember: boolean
  homeAppviewOutage: boolean
  setBlackskyOnlyDefault: (value: boolean) => void
  isReply: boolean
  isForcedBlackskyOnly: boolean
  isForcedCommunityTarget: boolean
  contextualCommunityFeedTarget?: CommunityFeedTarget
}) {
  const {t} = useLingui()
  const showContextualTarget =
    !isReply && !isForcedCommunityTarget && !!contextualCommunityFeedTarget
  const showBlackskyOnly =
    !showContextualTarget &&
    isCommunityMember &&
    !(isReply && !isForcedBlackskyOnly) &&
    (!isForcedCommunityTarget || isForcedBlackskyOnly)

  return (
    <>
      {showBlackskyOnly ? (
        <Toggle.Item
          name="blacksky_only"
          label={t`Blacksky Only`}
          value={thread.blackskyOnly}
          disabled={isForcedBlackskyOnly || homeAppviewOutage}
          onChange={() => {
            const next = !thread.blackskyOnly
            dispatch({type: 'toggle_blacksky_only'})
            setBlackskyOnlyDefault(next)
          }}
          style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Toggle.LabelText>
            {homeAppviewOutage ? (
              <Trans>Blacksky Only (temporarily unavailable)</Trans>
            ) : (
              <Trans>Blacksky Only</Trans>
            )}
          </Toggle.LabelText>
          <Toggle.Switch />
        </Toggle.Item>
      ) : null}
      {showContextualTarget ? (
        <Toggle.Item
          name="permissioned_space"
          label={t`Post publicly or to ${contextualCommunityFeedTarget.name}`}
          value={
            thread.communityFeed?.feed === contextualCommunityFeedTarget.feed
          }
          onChange={() => {
            dispatch({
              type: 'set_post_target',
              target:
                thread.communityFeed?.feed ===
                contextualCommunityFeedTarget.feed
                  ? 'public'
                  : contextualCommunityFeedTarget,
            })
          }}
          style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Toggle.LabelText>
            {contextualCommunityFeedTarget.name}
          </Toggle.LabelText>
          <Toggle.Switch />
        </Toggle.Item>
      ) : null}
    </>
  )
}
