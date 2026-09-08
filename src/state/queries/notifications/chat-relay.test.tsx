import {type ReactNode} from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

import {communityXrpc} from '#/lib/api/community'
import {useAgent, useSession} from '#/state/session'
import {
  CHAT_RELAY_REDIRECT_URI,
  chatRelayQueryKey,
  chatRelayReturnTo,
  useChatRelayPreferencesMutation,
} from './chat-relay'

jest.mock('#/env', () => ({IS_NATIVE: false}))
jest.mock('#/lib/api/community', () => ({communityXrpc: jest.fn()}))
jest.mock('#/state/session', () => ({
  useAgent: jest.fn(),
  useSession: jest.fn(),
}))

jest.mock('#/lib/constants', () => ({
  ...jest.requireActual('#/lib/constants'),
  CHAT_RELAY_ENABLED: true,
}))

describe('chat relay mutations', () => {
  it('uses the settings page for native OAuth completion', () => {
    expect(CHAT_RELAY_REDIRECT_URI).toBe(
      'community.blacksky:/messages/settings',
    )
    expect(chatRelayReturnTo()).toBeUndefined()
  })

  it.each(['https://blacksky.community', 'https://staging.blacksky.community'])(
    'uses the browser settings page for OAuth completion from %s',
    origin => {
      const previousLocation = window.location
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {origin},
      })
      try {
        expect(chatRelayReturnTo()).toBe(`${origin}/messages/settings`)
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: previousLocation,
        })
      }
    },
  )

  it('keeps the initiating account when the active account changes mid-request', async () => {
    const accountA = {did: 'did:plc:account-a', handle: 'a.example'}
    const accountB = {did: 'did:plc:account-b', handle: 'b.example'}
    let activeAccount = accountA
    const agent = {}
    jest.mocked(useAgent).mockReturnValue(agent as ReturnType<typeof useAgent>)
    jest.mocked(useSession).mockImplementation(
      () =>
        ({
          currentAccount: activeAccount,
        }) as ReturnType<typeof useSession>,
    )

    let resolveResponse!: (value: Response) => void
    const response = new Promise<Response>(resolve => {
      resolveResponse = resolve
    })
    jest.mocked(communityXrpc).mockImplementationOnce(() => response)

    const client = new QueryClient({
      defaultOptions: {
        queries: {retry: false, gcTime: Infinity},
        mutations: {retry: false, gcTime: 0},
      },
    })
    const initialA = {
      did: accountA.did,
      status: 'active' as const,
      preferences: {
        chat: {push: true, include: 'all' as const},
        chatRequest: {push: true, include: 'all' as const},
      },
    }
    const initialB = {...initialA, did: accountB.did}
    client.setQueryData(chatRelayQueryKey(accountA.did), initialA)
    client.setQueryData(chatRelayQueryKey(accountB.did), initialB)

    const wrapper = ({children}: {children: ReactNode}) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const {result, rerender, unmount} = renderHook(
      () => ({
        account: jest.mocked(useSession)(),
        mutation: useChatRelayPreferencesMutation(),
      }),
      {wrapper},
    )

    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.mutation.mutateAsync({
        did: result.current.account.currentAccount!.did,
        patch: {chat: {push: false}},
      })
    })
    activeAccount = accountB
    act(() => {
      rerender(undefined)
    })

    resolveResponse(
      new Response(
        JSON.stringify({
          preferences: {
            chat: {push: false, include: 'all'},
            chatRequest: {push: true, include: 'all'},
          },
        }),
      ),
    )
    await act(async () => {
      await pending
    })

    expect(client.getQueryData(chatRelayQueryKey(accountA.did))).toEqual({
      ...initialA,
      preferences: {
        chat: {push: false, include: 'all'},
        chatRequest: {push: true, include: 'all'},
      },
    })
    expect(client.getQueryData(chatRelayQueryKey(accountB.did))).toEqual(
      initialB,
    )
    unmount()
    client.clear()
  })
})
