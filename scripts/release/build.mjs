import {loadEnvFile} from 'node:process'
import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {
  git,
  invariant,
  json,
  required,
  save,
  sha,
  nativeFingerprint,
} from './core.mjs'

const command = process.argv[2]
if (command === 'environment') {
  const values = {
    EXPO_PUBLIC_ENV: 'production',
    EXPO_PUBLIC_RELEASE_VERSION: json('package.json').version,
    SENTRY_RELEASE: json('package.json').version,
    SENTRY_DIST: git('rev-parse', 'HEAD'),
    EXPO_PUBLIC_BUNDLE_IDENTIFIER: git('rev-parse', 'HEAD'),
    EXPO_PUBLIC_BUNDLE_DATE: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date())
      .replace(/\D/g, ''),
  }
  for (const key of [
    'SENTRY_DSN',
    'BITDRIFT_API_KEY',
    'EXPO_PUBLIC_GCP_PROJECT_ID',
    'EXPO_PUBLIC_METRICS_API_HOST',
    'EXPO_PUBLIC_GROWTHBOOK_API_HOST',
    'EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY',
    'EXPO_PUBLIC_STRIPE_API_URL',
    'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  ]) {
    const target = key.startsWith('EXPO_PUBLIC_') ? key : `EXPO_PUBLIC_${key}`
    if (process.env[key]) values[target] = process.env[key]
  }
  const text =
    (process.env.ENV_TOKEN || '') +
    '\n' +
    Object.entries(values)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') +
    '\n'
  writeFileSync('.env', text, {mode: 0o600})
  if (process.env.GOOGLE_SERVICES_TOKEN)
    writeFileSync('google-services.json', process.env.GOOGLE_SERVICES_TOKEN, {
      mode: 0o600,
    })
} else if (command === 'fingerprint') {
  console.log(
    JSON.stringify({
      sha: git('rev-parse', 'HEAD'),
      runtimeVersion: json('package.json').version,
      fingerprint: nativeFingerprint(),
    }),
  )
} else if (command === 'ota') {
  loadEnvFile('.env')
  execFileSync(
    'pnpm',
    [
      'exec',
      'eoas',
      'publish',
      '--branch',
      required('OTA_BRANCH'),
      '--platform=all',
      '--nonInteractive',
      '--disableRepositoryCheck',
      '--dumpSourcemap',
      '--message',
      required('CANDIDATE_SHA'),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        EXPO_PUBLIC_ENV: 'production',
        EXPO_PUBLIC_BUNDLE_IDENTIFIER: required('CANDIDATE_SHA'),
      },
    },
  )
} else if (command === 'native-record') {
  const platform = process.argv[3]
  invariant(['ios', 'android'].includes(platform), 'Invalid native platform')
  invariant(
    String(json('eas.json').submit['release-qa'].ios.ascAppId) ===
      required('ASC_APP_ID'),
    'QA submit profile targets another store app',
  )
  const path = required('NATIVE_ARTIFACT')
  const version = required('ACTUAL_VERSION')
  const actual = required('ACTUAL_BUILD_NUMBER')
  invariant(
    version === json('package.json').version,
    'Binary version differs from candidate',
  )
  invariant(
    required('ACTUAL_APP_IDENTIFIER') === required('RELEASE_APP_IDENTIFIER'),
    'Binary app identifier differs from configured store app',
  )
  invariant(/^[0-9]+(?:\.[0-9]+)*$/.test(actual), 'Invalid binary build number')
  invariant(
    actual !== '1',
    'Build number 1 means the EAS remote counter did not resolve during --local build',
  )
  invariant(
    git('rev-parse', 'HEAD') === sha(required('CANDIDATE_SHA')),
    'Native checkout mismatch',
  )
  const checksum = createHash('sha256').update(readFileSync(path)).digest('hex')
  save(`native-${platform}.json`, {
    sha: sha(required('CANDIDATE_SHA')),
    version,
    appIdentifier: required('ACTUAL_APP_IDENTIFIER'),
    checksum,
    [platform === 'ios' ? 'buildNumber' : 'versionCode']: actual,
  })
} else throw new Error('Unknown build command')
