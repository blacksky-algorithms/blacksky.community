const TARGET_RELEASE = '1.127.2'

export function shouldShowTestFlightAppStoreMigrationBanner({
  isIOS,
  isTestFlight,
  releaseVersion,
}: {
  isIOS: boolean
  isTestFlight: boolean
  releaseVersion: string
}) {
  return isIOS && isTestFlight && releaseVersion === TARGET_RELEASE
}
