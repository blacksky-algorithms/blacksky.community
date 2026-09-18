import {act, renderHook} from '@testing-library/react-native'

import {type SessionAccount} from '#/state/session'

const mockResumeSession = jest.fn()
const mockRequestSwitchToAccount = jest.fn()
const mockMetric = jest.fn()

jest.mock('#/state/session', () => ({
  useSessionApi: () => ({resumeSession: mockResumeSession}),
}))
jest.mock('#/state/shell/logged-out', () => ({
  useLoggedOutViewControls: () => ({
    requestSwitchToAccount: mockRequestSwitchToAccount,
  }),
}))
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: mockMetric}),
}))
jest.mock('@lingui/react', () => ({
  useLingui: () => ({_: (message: {message: string}) => message.message}),
}))
jest.mock('#/components/Toast', () => ({show: jest.fn()}))
jest.mock('#/logger', () => ({logger: {error: jest.fn()}}))
jest.mock('#/env', () => ({IS_WEB: false}))

import {useAccountSwitcher} from '../useAccountSwitcher'

const account: SessionAccount = {
  did: 'did:plc:test',
  handle: 'test.example',
  service: 'https://pds.example',
}

describe('useAccountSwitcher', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockResumeSession.mockResolvedValue(undefined)
  })

  it.each([
    ['OAuth', {...account, isOauthSession: true}],
    ['legacy', {...account, accessJwt: 'saved-access-token'}],
  ])(
    'restores a saved %s account without asking for sign-in',
    async (_, saved) => {
      const {result} = renderHook(() => useAccountSwitcher())

      await act(async () => {
        await result.current.onPressSwitchAccount(saved, 'SwitchAccount')
      })

      expect(mockResumeSession).toHaveBeenCalledWith(saved, true)
      expect(mockRequestSwitchToAccount).not.toHaveBeenCalled()
      expect(mockMetric).toHaveBeenCalledWith('account:loggedIn', {
        logContext: 'SwitchAccount',
        withPassword: false,
      })
      expect(result.current.pendingDid).toBeNull()
    },
  )

  it('asks for sign-in when a legacy account has no saved credentials', async () => {
    const {result} = renderHook(() => useAccountSwitcher())

    await act(async () => {
      await result.current.onPressSwitchAccount(account, 'SwitchAccount')
    })

    expect(mockResumeSession).not.toHaveBeenCalled()
    expect(mockRequestSwitchToAccount).toHaveBeenCalledWith({
      requestedAccount: account.did,
    })
    expect(mockMetric).not.toHaveBeenCalled()
  })

  it('falls back to sign-in when OAuth restoration fails', async () => {
    mockResumeSession.mockRejectedValue(new Error('Session unavailable'))
    const saved = {...account, isOauthSession: true}
    const {result} = renderHook(() => useAccountSwitcher())

    await act(async () => {
      await result.current.onPressSwitchAccount(saved, 'SwitchAccount')
    })

    expect(mockResumeSession).toHaveBeenCalledWith(saved, true)
    expect(mockRequestSwitchToAccount).toHaveBeenCalledWith({
      requestedAccount: account.did,
    })
    expect(mockMetric).not.toHaveBeenCalled()
    expect(result.current.pendingDid).toBeNull()
  })
})
