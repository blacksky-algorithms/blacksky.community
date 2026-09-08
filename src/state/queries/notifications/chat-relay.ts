import {openAuthSessionAsync} from 'expo-web-browser'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {communityXrpc} from '#/lib/api/community'
import {CHAT_NOTIF_PROXY_HEADER, CHAT_RELAY_ENABLED} from '#/lib/constants'
import {useAgent, useSession} from '#/state/session'
import {IS_NATIVE} from '#/env'

export const CHAT_RELAY_REDIRECT_URI = 'community.blacksky:/messages/settings'

export type ChatRelayPreference = {
  push: boolean
  include: 'all' | 'follows'
}

export type ChatRelayPreferences = {
  chat: ChatRelayPreference
  chatRequest: ChatRelayPreference
}

export type ChatRelayPreferencesPatch = {
  chat?: Partial<ChatRelayPreference>
  chatRequest?: Partial<ChatRelayPreference>
}

export type ChatRelayEnrollmentInput = {
  did: string
  handle: string
}

export type ChatRelayAccountInput = {
  did: string
}

export type ChatRelayPreferencesInput = ChatRelayAccountInput & {
  patch: ChatRelayPreferencesPatch
}

export type ChatRelayStatus = {
  did: string
  generation?: string
  status: 'active' | 'disconnected' | 'reauth_required'
  preferences: ChatRelayPreferences
}

type EnrollmentResponse = {
  authorizationUrl: string
}

const CHAT_RELAY_QUERY = 'chat-relay'

export function chatRelayReturnTo() {
  if (IS_NATIVE) return CHAT_RELAY_REDIRECT_URI
  const origin =
    typeof window !== 'undefined' ? window.location?.origin : undefined
  if (origin) {
    return `${origin}/messages/settings`
  }
  return undefined
}

export function chatRelayQueryKey(did?: string) {
  return [CHAT_RELAY_QUERY, did]
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = __DEV__ ? await response.text().catch(() => '') : ''
    throw new Error(
      `Chat relay request failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  return (await response.json()) as T
}

async function getStatus(
  agent: ReturnType<typeof useAgent>,
  expectedDid: string,
) {
  const status = await readJson<ChatRelayStatus | null>(
    await communityXrpc(
      agent,
      'community.blacksky.courier.getEnrollmentStatus',
      {
        proxyHeader: CHAT_NOTIF_PROXY_HEADER,
      },
    ),
  )
  if (!status) return status
  if (status.did !== expectedDid) {
    throw new Error('Chat relay account did not match the signed-in account')
  }
  if (status.status !== 'active') return status
  const preferences = await readJson<{preferences: ChatRelayPreferences}>(
    await communityXrpc(agent, 'chat.bsky.notification.getPreferences', {
      proxyHeader: CHAT_NOTIF_PROXY_HEADER,
    }),
  )
  return {...status, preferences: preferences.preferences}
}

export function useChatRelayStatusQuery() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const did = currentAccount?.did

  return useQuery({
    queryKey: chatRelayQueryKey(did),
    queryFn: () => getStatus(agent, did!),
    enabled: CHAT_RELAY_ENABLED && !!did,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
}

export function useChatRelayEnrollmentMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({did, handle}: ChatRelayEnrollmentInput) => {
      const returnTo = chatRelayReturnTo()
      const response = await communityXrpc(
        agent,
        'community.blacksky.courier.startEnrollment',
        {
          body: {
            handle,
            ...(returnTo ? {returnTo} : {}),
          },
          proxyHeader: CHAT_NOTIF_PROXY_HEADER,
        },
      )
      const data = await readJson<EnrollmentResponse>(response)
      const authorizationUrl = data.authorizationUrl

      if (IS_NATIVE) {
        const result = await openAuthSessionAsync(
          authorizationUrl,
          CHAT_RELAY_REDIRECT_URI,
        )
        const resultType = String(result.type)
        if (resultType !== 'success') {
          return {did, completed: false}
        }
      } else {
        window.location.assign(authorizationUrl)
      }
      return {did, completed: true}
    },
    onSuccess: result => {
      void queryClient.invalidateQueries({
        queryKey: chatRelayQueryKey(result.did),
      })
    },
  })
}

export function useChatRelayDisconnectMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({did}: ChatRelayAccountInput) => {
      await readJson<{ok: true}>(
        await communityXrpc(agent, 'community.blacksky.courier.disconnect', {
          body: {},
          proxyHeader: CHAT_NOTIF_PROXY_HEADER,
        }),
      )
      return {did}
    },
    onSuccess: result => {
      void queryClient.invalidateQueries({
        queryKey: chatRelayQueryKey(result.did),
      })
    },
  })
}

export function useChatRelayPreferencesMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({did, patch}: ChatRelayPreferencesInput) => {
      const response = await communityXrpc(
        agent,
        'chat.bsky.notification.putPreferences',
        {body: patch, proxyHeader: CHAT_NOTIF_PROXY_HEADER},
      )
      const result = await readJson<{preferences: ChatRelayPreferences}>(
        response,
      )
      return {did, preferences: result.preferences}
    },
    onSuccess: result => {
      queryClient.setQueryData(
        chatRelayQueryKey(result.did),
        (old?: ChatRelayStatus | null) =>
          old ? {...old, preferences: result.preferences} : old,
      )
    },
  })
}
