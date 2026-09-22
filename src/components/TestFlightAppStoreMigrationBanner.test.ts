import {shouldShowTestFlightAppStoreMigrationBanner} from './TestFlightAppStoreMigrationBannerGate'

describe('shouldShowTestFlightAppStoreMigrationBanner', () => {
  it('shows on the targeted iOS TestFlight release', () => {
    expect(
      shouldShowTestFlightAppStoreMigrationBanner({
        isIOS: true,
        isTestFlight: true,
        releaseVersion: '1.127.2',
      }),
    ).toBe(true)
  })

  it.each([
    {isIOS: true, isTestFlight: true, releaseVersion: '1.127.1'},
    {isIOS: false, isTestFlight: true, releaseVersion: '1.127.2'},
    {isIOS: true, isTestFlight: false, releaseVersion: '1.127.2'},
    {isIOS: true, isTestFlight: true, releaseVersion: '1.130.2'},
  ])('does not show outside the targeted installs', input => {
    expect(shouldShowTestFlightAppStoreMigrationBanner(input)).toBe(false)
  })
})
