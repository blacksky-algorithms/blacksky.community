import {View} from 'react-native'
import {msg, ph} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {RichTransText} from '#/lib/lingui/RichTransText'
import {useSession} from '#/state/session'
import {UserInfoText} from '#/view/com/util/UserInfoText'
import {atoms as a, useTheme} from '#/alf'
import {ArrowCornerDownRight_Stroke2_Corner2_Rounded as ArrowCornerDownRightIcon} from '#/components/icons/ArrowCornerDownRight'
import {ProfileHoverCard} from '#/components/ProfileHoverCard'
import {Text} from '#/components/Typography'
import type * as bsky from '#/types/bsky'

export function PostRepliedTo({
  parentAuthor,
  isParentBlocked,
  isParentNotFound,
}: {
  parentAuthor: string | bsky.profile.AnyProfileView | undefined
  isParentBlocked?: boolean
  isParentNotFound?: boolean
}) {
  const t = useTheme()
  const {_} = useLingui()
  const {currentAccount} = useSession()

  const textStyle = [a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]
  const textProps = {
    style: [a.flex_1, textStyle],
    numberOfLines: 1,
  }

  let label
  if (isParentBlocked) {
    label = _(
      msg({message: 'Replied to a blocked post', context: 'description'}),
    )
  } else if (isParentNotFound) {
    label = _(msg({message: 'Replied to a post', context: 'description'}))
  } else if (parentAuthor) {
    const did =
      typeof parentAuthor === 'string' ? parentAuthor : parentAuthor.did
    const isMe = currentAccount?.did === did
    if (isMe) {
      label = _(msg({message: 'Replied to you', context: 'description'}))
    } else {
      label = (
        <RichTransText
          message={msg({
            message: `Replied to ${ph({author: ''})}`,
            context: 'description',
          })}
          values={{
            author: (
              <ProfileHoverCard did={did}>
                <UserInfoText did={did} attr="displayName" style={textStyle} />
              </ProfileHoverCard>
            ),
          }}
          textProps={textProps}
        />
      )
    }
  }

  if (!label) {
    // Should not happen.
    return null
  }

  return (
    <View style={[a.flex_row, a.align_center, a.pb_xs, a.gap_xs]}>
      <ArrowCornerDownRightIcon
        size="xs"
        style={[t.atoms.text_contrast_medium, {top: -1}]}
      />
      {typeof label === 'string' ? <Text {...textProps}>{label}</Text> : label}
    </View>
  )
}
