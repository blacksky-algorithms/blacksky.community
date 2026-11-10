import {Alert} from 'react-native'
import {act, renderHook} from '@testing-library/react-native'

const mockCheckForUpdateAsync = jest.fn()
const mockSetOverride = jest.fn()
const mockUseUpdates = jest.fn()

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: () => mockCheckForUpdateAsync() as unknown,
  fetchUpdateAsync: jest.fn(),
  isEnabled: true,
  reloadAsync: jest.fn(),
  setExtraParamAsync: jest.fn(() => Promise.resolve()),
  setUpdateURLAndRequestHeadersOverride: (value: unknown) =>
    mockSetOverride(value) as unknown,
  UpdateCheckResultNotAvailableReason: {},
  useUpdates: () => mockUseUpdates() as unknown,
}))
jest.mock('expo-application', () => ({nativeBuildVersion: '1'}))
jest.mock('expo-linking', () => ({getLinkingURL: () => null}))
jest.mock('#/alf', () => ({useTheme: () => ({scheme: 'light'})}))
jest.mock('#/storage', () => ({device: {set: jest.fn(), remove: jest.fn()}}))
jest.mock('#/env', () => ({
  APP_VERSION: '1.0.0',
  IS_INTERNAL: true,
  IS_IOS: true,
  IS_TESTFLIGHT: true,
}))

import {useApplyPullRequestOTAUpdate} from '../useOTAUpdates'

function running(channel: string) {
  return {
    currentlyRunning: {channel: 'testflight', manifest: {metadata: {channel}}},
  }
}

describe('checkForUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockCheckForUpdateAsync.mockResolvedValue({isAvailable: false})
  })

  it('checks the pull request channel that is running', async () => {
    mockUseUpdates.mockReturnValue(running('pull-request-123'))
    const {result} = renderHook(() => useApplyPullRequestOTAUpdate())

    await act(() => result.current.checkForUpdates())

    expect(mockSetOverride).toHaveBeenCalledTimes(1)
    expect(mockSetOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHeaders: {'expo-channel-name': 'pull-request-123'},
      }),
    )
    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it('leaves the build channel alone on a standard deployment', async () => {
    mockUseUpdates.mockReturnValue(running('testflight'))
    const {result} = renderHook(() => useApplyPullRequestOTAUpdate())

    await act(() => result.current.checkForUpdates())

    expect(mockSetOverride).not.toHaveBeenCalled()
    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1)
  })
})
