import {createHash} from 'node:crypto'
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'

export function invariant(value, message) {
  if (!value) throw new Error(message)
  return value
}
export const json = path => JSON.parse(readFileSync(path, 'utf8'))
export const save = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const canonical = value =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, canonical(value[key])]),
        )
      : value
export const digest = value =>
  createHash('sha256')
    .update(
      typeof value === 'string' ? value : JSON.stringify(canonical(value)),
    )
    .digest('hex')
export const git = (...args) =>
  execFileSync('git', args, {encoding: 'utf8'}).trim()
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const required = name => invariant(process.env[name], `Missing ${name}`)
export function output(name, value) {
  invariant(!String(value).includes('\n'), `Invalid output ${name}`)
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}
export function sha(value) {
  invariant(/^[a-f0-9]{40}$/.test(value), 'Expected full commit SHA')
  return value
}
export function releaseBranch(value) {
  invariant(
    /^release\/\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(value),
    'Invalid release branch',
  )
  return value
}
export function compareVersions(a, b) {
  const parse = v => {
    invariant(/^\d+\.\d+\.\d+$/.test(v), `Invalid runtime version: ${v}`)
    return v.split('.').map(Number)
  }
  const av = parse(a),
    bv = parse(b)
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] - bv[i]
  return 0
}
export function nextVersion(current, baseline) {
  const version = compareVersions(current, baseline) > 0 ? current : baseline
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}
export function chooseChecks(runs, names) {
  return names.map(name => {
    const matches = runs.filter(
      r => r.name === name && r.app?.slug === 'github-actions',
    )
    const latest = matches.sort((a, b) => b.id - a.id)[0]
    if (!latest || latest.status !== 'completed') return 'pending'
    return latest.conclusion === 'success' ? 'success' : 'failure'
  })
}
export function validateManifest(m, requireArtifacts = true) {
  invariant(m.schema === 1, 'Unsupported candidate manifest')
  sha(m.sha)
  releaseBranch(m.branch)
  invariant(m.mode === 'ota' || m.mode === 'native', 'Invalid candidate mode')
  compareVersions(m.runtimeVersion, m.runtimeVersion)
  invariant(
    /^sha256:[a-f0-9]{64}$/.test(m.web.digest),
    'Missing immutable web digest',
  )
  invariant(m.web.sha === m.sha, 'Web candidate SHA mismatch')
  invariant(
    m.web.version === m.runtimeVersion,
    'Web candidate runtime mismatch',
  )
  {
    invariant(
      m.ota.runtimeVersion === m.runtimeVersion,
      'OTA candidate runtime mismatch',
    )
    for (const platform of ['ios', 'android']) {
      if (requireArtifacts)
        invariant(
          m.ota.artifacts?.[platform]?.assets?.length &&
            /^[a-f0-9]{64}$/.test(m.ota.artifacts[platform].manifestHash),
          'Missing tested OTA asset hashes',
        )
      invariant(
        m.ota.updates[platform]?.commitHash === m.sha,
        `Missing ${platform} OTA identity`,
      )
      invariant(
        m.ota.updates[platform]?.updateId,
        `Missing ${platform} update ID`,
      )
    }
  }
  if (m.mode === 'native') {
    for (const platform of ['ios', 'android']) {
      invariant(
        m[platform]?.appIdentifier === m.config.stores.appIdentifier,
        `Wrong ${platform} app identifier`,
      )
      invariant(m[platform]?.sha === m.sha, `Missing ${platform} binary`)
      invariant(
        m[platform]?.version === m.runtimeVersion,
        `Wrong ${platform} native version`,
      )
      invariant(
        /^[a-f0-9]{64}$/.test(m[platform]?.checksum),
        `Missing ${platform} checksum`,
      )
    }
  }
  return m
}
export function assertCurrent(m, head, manifestHash) {
  validateManifest(m)
  invariant(
    m.sha === head,
    'Candidate superseded by a release-branch change; prepare and approve the replacement',
  )
  invariant(
    digest(m) === manifestHash,
    'Candidate manifest changed after approval request',
  )
}

export function candidatePointer(body) {
  const asset = /^Manifest: (candidate-[a-f0-9-]+\.json)$/m.exec(
    body || '',
  )?.[1]
  const hash = /^Manifest SHA-256: ([a-f0-9]{64})$/m.exec(body || '')?.[1]
  return invariant(
    asset && hash && {asset, hash},
    'Missing current candidate pointer',
  )
}

export function nativeFingerprint() {
  const hashes = ['ios', 'android'].map(platform =>
    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `
    import {createFingerprintAsync, SourceSkips} from '@expo/fingerprint';
    const fingerprint = await createFingerprintAsync('.', {platforms: [process.env.EAS_BUILD_PLATFORM], silent: true,
      sourceSkips: SourceSkips.ExpoConfigVersions | SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun,
      extraSources: ['modules', 'plugins', 'assets'].map(filePath => ({type: 'dir', filePath, reasons: ['localNativeInputs']}))});
    if (!fingerprint.sources.some(source => source.id === 'expoConfig')) throw new Error('Expo config fingerprint missing');
    console.log(fingerprint.hash);
  `,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          EXPO_PUBLIC_ENV: 'production',
          EXPO_PUBLIC_UPDATE_CHANNEL: 'production',
          EAS_BUILD_PLATFORM: platform,
          SENTRY_AUTH_TOKEN: 'fingerprint-presence-only',
          EXPO_NO_DOTENV: '1',
        },
      },
    ).trim(),
  )
  invariant(
    hashes.every(hash => /^[a-f0-9]{40}$/.test(hash)),
    'Invalid Expo fingerprint',
  )
  return digest(hashes)
}
