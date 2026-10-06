const mockGetBadgeCountAsync = jest.fn()
const mockSetBadgeCountAsync = jest.fn()
const mockGetAllPrefsAsync = jest.fn()
const mockSetStoredBadgeCountAsync = jest.fn()

jest.mock('expo-notifications', () => ({
  getBadgeCountAsync: () => mockGetBadgeCountAsync(),
  setBadgeCountAsync: (count: number) => mockSetBadgeCountAsync(count),
}))
jest.mock('#/../modules/expo-background-notification-handler', () => ({
  __esModule: true,
  default: {
    getAllPrefsAsync: () => mockGetAllPrefsAsync(),
    setBadgeCountAsync: (count: number) => mockSetStoredBadgeCountAsync(count),
  },
}))
jest.mock('#/state/session', () => ({}))
jest.mock('#/analytics', () => ({}))

import {syncBadgeCount} from '../notifications'

function givenBadges({stored, icon}: {stored: number; icon: number}) {
  mockGetAllPrefsAsync.mockResolvedValue({badgeCount: stored})
  mockGetBadgeCountAsync.mockResolvedValue(icon)
}

describe('syncBadgeCount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('clears the icon and stored count when nothing is unread', async () => {
    givenBadges({stored: 7, icon: 7})
    await syncBadgeCount(0)
    expect(mockSetStoredBadgeCountAsync).toHaveBeenCalledWith(0)
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0)
  })

  it('clears a stale stored count after the server already zeroed the icon', async () => {
    givenBadges({stored: 7, icon: 0})
    await syncBadgeCount(0)
    expect(mockSetStoredBadgeCountAsync).toHaveBeenCalledWith(0)
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled()
  })

  it('does not put a badge back on an icon the server cleared', async () => {
    givenBadges({stored: 7, icon: 0})
    await syncBadgeCount(3)
    expect(mockSetStoredBadgeCountAsync).toHaveBeenCalledWith(3)
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled()
  })

  it('lowers the badge to the unread count', async () => {
    givenBadges({stored: 5, icon: 5})
    await syncBadgeCount(2)
    expect(mockSetStoredBadgeCountAsync).toHaveBeenCalledWith(2)
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(2)
  })

  it('never raises the badge above the pushes received', async () => {
    givenBadges({stored: 1, icon: 1})
    await syncBadgeCount(12)
    expect(mockSetStoredBadgeCountAsync).not.toHaveBeenCalled()
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled()
  })

  it('does not write when the badge already matches', async () => {
    givenBadges({stored: 0, icon: 0})
    await syncBadgeCount(0)
    expect(mockSetStoredBadgeCountAsync).not.toHaveBeenCalled()
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled()
  })

  it('still lowers the icon when the app group is unavailable', async () => {
    mockGetAllPrefsAsync.mockResolvedValue(null)
    mockGetBadgeCountAsync.mockResolvedValue(4)
    await syncBadgeCount(0)
    expect(mockSetStoredBadgeCountAsync).not.toHaveBeenCalled()
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0)
  })

  it('swallows native errors', async () => {
    mockGetAllPrefsAsync.mockRejectedValue(new Error('no app group'))
    mockGetBadgeCountAsync.mockResolvedValue(3)
    await expect(syncBadgeCount(0)).resolves.toBeUndefined()
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled()
  })
})
