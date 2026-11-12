import {moderateProfile, type ModerationOpts} from '@bsky/sdk/moderation'

import {type app} from '#/lexicons'
import {type ChatMessage} from './live-state'

export function visibleMessages(
  messages: ChatMessage[],
  profiles: ReadonlyMap<string, app.bsky.actor.defs.ProfileViewDetailed>,
  moderationOpts: ModerationOpts,
) {
  const out: {
    message: ChatMessage
    profile: app.bsky.actor.defs.ProfileViewDetailed
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
