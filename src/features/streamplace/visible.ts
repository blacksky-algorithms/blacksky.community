import {
  type AppBskyActorDefs,
  moderateProfile,
  type ModerationOpts,
} from '@atproto/api'

import {type ChatMessage} from './live-state'

export function visibleMessages(
  messages: ChatMessage[],
  profiles: ReadonlyMap<string, AppBskyActorDefs.ProfileViewDetailed>,
  moderationOpts: ModerationOpts,
) {
  const out: {
    message: ChatMessage
    profile: AppBskyActorDefs.ProfileViewDetailed
  }[] = []
  for (const message of messages) {
    const profile = profiles.get(message.authorDid)
    if (!profile) continue
    const ui = moderateProfile(profile, moderationOpts).ui('contentList')
    if (ui.filter || ui.blur) continue
    out.push({message, profile})
  }
  return out
}
