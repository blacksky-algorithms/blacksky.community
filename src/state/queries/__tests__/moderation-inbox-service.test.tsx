import {type PropsWithChildren} from 'react'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook, waitFor} from '@testing-library/react-native'

import {useAppviewClient, useSession} from '#/state/session'
import {BLACKSKY_MOD_SERVICE} from '#/state/session/additional-moderation-authorities'
import {tools} from '#/lexicons'
import {
  useModerationInboxAccountStatusQuery,
  useUpdateModerationInboxSeenMutation,
} from '../moderation-inbox'

jest.mock('#/state/session', () => ({
  useAppviewClient: jest.fn(),
  useSession: jest.fn(),
}))
jest.mock('#/components/Toast', () => ({show: jest.fn()}))
jest.mock('#/logger', () => ({logger: {error: jest.fn(), debug: jest.fn()}}))

i18n.activate('en')

const OWN_SERVICE = BLACKSKY_MOD_SERVICE

function setup() {
  const call = jest.fn().mockResolvedValue({})
  jest.mocked(useAppviewClient).mockReturnValue({call} as never)
  jest.mocked(useSession).mockReturnValue({
    currentAccount: {did: 'did:plc:viewer'},
    hasSession: true,
  } as never)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {retry: false, gcTime: Infinity},
      mutations: {retry: false, gcTime: Infinity},
    },
  })
  const wrapper = ({children}: PropsWithChildren) => (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nProvider>
  )
  return {call, wrapper}
}

describe('moderation inbox service', () => {
  it('is the Blacksky moderation service', () => {
    expect(OWN_SERVICE).toBe('did:plc:d2mkddsbmnrgr3domzg5qexf#atproto_labeler')
  })

  it('reads the inbox from the app’s own moderation service', async () => {
    const {call, wrapper} = setup()

    renderHook(() => useModerationInboxAccountStatusQuery(), {wrapper})

    await waitFor(() => expect(call).toHaveBeenCalled())
    expect(call).toHaveBeenCalledWith(
      tools.ozone.inbox.getAccountStatus,
      {},
      {service: OWN_SERVICE},
    )
  })

  it('marks the inbox seen on the same service', async () => {
    const {call, wrapper} = setup()
    const {result} = renderHook(() => useUpdateModerationInboxSeenMutation(), {
      wrapper,
    })

    await act(() => result.current.mutateAsync({sections: ['reports']}))

    expect(call).toHaveBeenCalledWith(
      tools.ozone.inbox.updateSeen,
      {sections: ['reports']},
      {service: OWN_SERVICE},
    )
  })

  it('marks an item seen on the service it came from', async () => {
    const {call, wrapper} = setup()
    const {result} = renderHook(
      () =>
        useUpdateModerationInboxSeenMutation({
          moderationService: 'did:plc:other',
        }),
      {wrapper},
    )

    await act(() => result.current.mutateAsync({sections: ['reports']}))

    expect(call).toHaveBeenCalledWith(
      tools.ozone.inbox.updateSeen,
      {sections: ['reports']},
      {service: 'did:plc:other#atproto_labeler'},
    )
  })
})
