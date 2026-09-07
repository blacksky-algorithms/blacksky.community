import {loadEnvFile} from 'node:process'
import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {git, invariant, json, required, save, sha} from './core.mjs'

const command = process.argv[2]
if (command === 'environment') {
  const values = {
    EXPO_PUBLIC_ENV: 'production',
    EXPO_PUBLIC_RELEASE_VERSION: json('package.json').version,
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
} else if (command === 'native-config') {
  sha(required('CANDIDATE_SHA'))
  invariant(
    git('rev-parse', 'HEAD') === process.env.CANDIDATE_SHA,
    'Native checkout mismatch',
  )
  const number = Number(required('NATIVE_BUILD_NUMBER'))
  invariant(
    Number.isInteger(number) && number > 0 && number < 2100000000,
    'Invalid allocated native build number',
  )
  const profile = process.env.NATIVE_PROFILE || 'release'
  invariant(
    ['release', 'release-qa'].includes(profile),
    'Invalid native profile',
  )
  const config = json('eas.json')
  config.cli.appVersionSource = 'local'
  config.build[profile].ios = {
    ...config.build[profile].ios,
    autoIncrement: false,
  }
  config.build[profile].android = {
    ...config.build[profile].android,
    autoIncrement: false,
  }
  save('eas.json', config)
} else if (command === 'native-record') {
  const platform = process.argv[3]
  invariant(['ios', 'android'].includes(platform), 'Invalid native platform')
  const path = required('NATIVE_ARTIFACT')
  const version = required('ACTUAL_VERSION')
  const actual = required('ACTUAL_BUILD_NUMBER')
  invariant(
    version === json('package.json').version,
    'Binary version differs from candidate',
  )
  invariant(
    actual === required('NATIVE_BUILD_NUMBER'),
    'Build system changed allocated native number',
  )
  const checksum = createHash('sha256').update(readFileSync(path)).digest('hex')
  save(`native-${platform}.json`, {
    sha: sha(required('CANDIDATE_SHA')),
    version,
    checksum,
    [platform === 'ios' ? 'buildNumber' : 'versionCode']: actual,
  })
} else throw new Error('Unknown build command')
