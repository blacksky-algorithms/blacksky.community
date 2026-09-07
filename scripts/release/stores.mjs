import {createPrivateKey, sign} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {invariant, required} from './core.mjs'

function appleToken() {
  const encode = value =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({alg: 'ES256', kid: required('ASC_KEY_ID'), typ: 'JWT'})
  const payload = encode({
    iss: required('ASC_ISSUER_ID'),
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })
  const key = createPrivateKey(
    Buffer.from(required('ASC_KEY_P8_BASE64'), 'base64'),
  )
  return `${header}.${payload}.${sign('sha256', Buffer.from(`${header}.${payload}`), {key, dsaEncoding: 'ieee-p1363'}).toString('base64url')}`
}
async function apple(path, body) {
  const response = await fetch(
    `https://api.appstoreconnect.apple.com/v1/${path}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${appleToken()}`,
        'content-type': 'application/json',
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(60000),
    },
  )
  invariant(response.ok, `App Store Connect: HTTP ${response.status}`)
  return response.status === 204 ? null : response.json()
}
export async function appleVersion(m, optional = false) {
  const app = await apple(`apps/${required('ASC_APP_ID')}`)
  invariant(
    app.data?.attributes.bundleId === m.config.stores.appIdentifier,
    'App Store app ID belongs to a different bundle identifier',
  )
  const query = new URLSearchParams({
    'filter[versionString]': m.runtimeVersion,
    'filter[platform]': 'IOS',
    include: 'build',
  })
  const result = await apple(
    `apps/${required('ASC_APP_ID')}/appStoreVersions?${query}`,
  )
  if (optional && result.data?.length === 0) return null
  const version = invariant(
    result.data?.length === 1 && result.data[0],
    'Expected exact App Store version',
  )
  const build = result.included?.find(
    b => b.type === 'builds' && b.id === version.relationships.build.data?.id,
  )
  if (
    optional &&
    [
      'PREPARE_FOR_SUBMISSION',
      'DEVELOPER_REJECTED',
      'REJECTED',
      'METADATA_REJECTED',
    ].includes(version.attributes.appStoreState)
  )
    return null
  invariant(
    build?.attributes.version === String(m.ios.buildNumber),
    'App Store version references a different build',
  )
  return version
}
export async function releaseApple(m) {
  const version = await appleVersion(m)
  if (
    ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(
      version.attributes.appStoreState,
    )
  )
    return true
  if (version.attributes.appStoreState === 'PROCESSING_FOR_DISTRIBUTION')
    return false
  invariant(
    version.attributes.appStoreState === 'PENDING_DEVELOPER_RELEASE',
    'iOS is not ready for release; web and OTA remain held',
  )
  await apple('appStoreVersionReleaseRequests', {
    data: {
      type: 'appStoreVersionReleaseRequests',
      relationships: {
        appStoreVersion: {data: {type: 'appStoreVersions', id: version.id}},
      },
    },
  })
  return false
}
export function fastlane(lane, m) {
  const directory = mkdtempSync(join(tmpdir(), 'release-store-'))
  try {
    const applePath = join(directory, 'apple.json')
    writeFileSync(
      applePath,
      JSON.stringify({
        key_id: required('ASC_KEY_ID'),
        issuer_id: required('ASC_ISSUER_ID'),
        key: Buffer.from(required('ASC_KEY_P8_BASE64'), 'base64').toString(),
        in_house: false,
      }),
      {mode: 0o600},
    )
    const playPath = join(directory, 'play.json')
    writeFileSync(playPath, required('GPLAY_SERVICE_ACCOUNT_JSON'), {
      mode: 0o600,
    })
    execFileSync('bundle', ['exec', 'fastlane', lane], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FASTLANE_SKIP_UPDATE_CHECK: '1',
        ASC_API_KEY_PATH: applePath,
        PLAY_JSON_PATH: playPath,
        RELEASE_VERSION: m.runtimeVersion,
        IOS_BUILD_NUMBER: String(m.ios.buildNumber),
        ANDROID_VERSION_CODE: String(m.android.versionCode),
        IOS_DESTINATION: m.config.iosDestination,
      },
    })
  } finally {
    rmSync(directory, {recursive: true, force: true})
  }
}

export async function submitNative(gh, m, receipt, key, adapters = {}) {
  const run = adapters.fastlane || fastlane
  const getVersion = adapters.appleVersion || appleVersion
  for (const platform of ['ios', 'android']) {
    if (await gh.succeeded(`native-${platform}-submitted`, key)) continue
    if (platform === 'ios' && m.config.iosDestination === 'app-store') {
      const version = await getVersion(m, true)
      if (!version) run('submit_ios', m)
      else
        invariant(
          [
            'WAITING_FOR_REVIEW',
            'IN_REVIEW',
            'PENDING_DEVELOPER_RELEASE',
            'PROCESSING_FOR_DISTRIBUTION',
            'READY_FOR_SALE',
            'READY_FOR_DISTRIBUTION',
            'PENDING_APPLE_RELEASE',
          ].includes(version.attributes.appStoreState),
          'Existing iOS submission requires manual reconciliation',
        )
    } else if (platform === 'android') run('submit_android', m)
    await gh.event(receipt, `native-${platform}-submitted`, 'success')
  }
}
