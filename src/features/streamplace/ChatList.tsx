import {Pressable, View} from 'react-native'
import {
  type AppBskyActorDefs,
  moderateProfile,
  type ModerationOpts,
} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {List} from '#/view/com/util/List'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {type ChatMessage} from './live-state'
import {type PendingMessage} from './pending'

type VisibleMessage = {
  message: ChatMessage
  profile: AppBskyActorDefs.ProfileViewDetailed
}

type ChatItem =
  | {kind: 'message'; item: VisibleMessage}
  | {kind: 'pending'; item: PendingMessage}

export function ChatList({
  messages,
  pending,
  moderationOpts,
  onRetry,
}: {
  messages: VisibleMessage[]
  pending: PendingMessage[]
  moderationOpts: ModerationOpts
  onRetry: (message: PendingMessage) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const data: ChatItem[] = [
    ...messages.map(item => ({kind: 'message' as const, item})),
    ...pending.map(item => ({kind: 'pending' as const, item})),
  ].reverse()

  return (
    <List
      data={data}
      inverted
      keyExtractor={(item: ChatItem) =>
        item.kind === 'message'
          ? item.item.message.uri
          : `pending:${item.item.localId}`
      }
      ListEmptyComponent={
        <Text
          style={[
            a.px_md,
            a.py_lg,
            a.text_center,
            t.atoms.text_contrast_medium,
          ]}>
          <Trans>No messages yet</Trans>
        </Text>
      }
      renderItem={({item}: {item: ChatItem}) => {
        if (item.kind === 'pending') {
          const failed = item.item.status === 'failed'
          return (
            <Pressable
              disabled={!failed}
              onPress={() => onRetry(item.item)}
              style={[a.px_md, a.py_xs, !failed && {opacity: 0.5}]}
              accessibilityRole={failed ? 'button' : undefined}>
              <Text
                style={failed ? {color: t.palette.negative_500} : undefined}>
                {failed
                  ? _(msg`Not delivered · Tap to retry`)
                  : _(msg`sending…`)}
              </Text>
              <Text>{item.item.text}</Text>
            </Pressable>
          )
        }

        const {message, profile} = item.item
        const displayName = profile.displayName || profile.handle
        const moderation = moderateProfile(profile, moderationOpts)
        return (
          <View
            style={[a.px_md, a.py_xs, a.flex_row, a.gap_sm, a.align_center]}>
            <UserAvatar
              type="user"
              size={20}
              avatar={profile.avatar}
              moderation={moderation.ui('avatar')}
            />
            <Text style={a.flex_1}>
              <Text style={a.font_bold}>{displayName}</Text> {message.text}
            </Text>
          </View>
        )
      }}
    />
  )
}
