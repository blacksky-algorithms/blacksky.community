export const OAUTH_BASE_URL: string =
  process.env.EXPO_PUBLIC_OAUTH_BASE_URL || 'https://blacksky.community'

export const OAUTH_CLIENT_NAME: string =
  process.env.EXPO_PUBLIC_OAUTH_CLIENT_NAME || 'Blacksky Community'

export const OAUTH_SCOPE =
  'atproto transition:generic transition:email transition:chat.bsky identity:handle account:email?action=manage account:status?action=manage space:community.blacksky.feed?authority=*&collection=app.bsky.feed.post&collection=app.bsky.feed.like space:community.blacksky.private?authority=*&collection=app.bsky.feed.post&collection=app.bsky.feed.like space:community.blacksky.private?action=read_self&manage=create&manage=update&manage=delete space:community.blacksky.status?authority=*&collection=community.blacksky.status.update space:community.blacksky.status?action=read_self&manage=create&manage=update&manage=delete'
