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
export const digest = value =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
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
export function requiresNative(paths) {
  return paths.some(path => {
    if (/\.(swift|m|mm|h|c|cpp|kt|java|podspec|gradle|plist|entitlements)$/.test(path)) return true
    return !(
      /^(src|bskyweb|bskyembed|docs|scripts\/release|\.github|\.release)\//.test(path) ||
      /\.(md|mdx)$/.test(path) ||
      /^(LICENSE|\.gitignore|\.prettierignore)$/.test(path) ||
      /^assets\/(?!app-icons\/|fonts\/|.*splash).+\.(png|jpg|jpeg|webp|gif|svg)$/.test(path)
    )
  })
}
export function nativeChanges(base, head) {
  const paths = git('diff', '--name-only', base, head).split('\n').filter(Boolean)
  if (paths.includes('package.json')) {
    const before = JSON.parse(git('show', `${base}:package.json`))
    const after = JSON.parse(git('show', `${head}:package.json`))
    delete before.version
    delete after.version
    if (digest(before) !== digest(after)) return true
  }
  return requiresNative(paths.filter(p => p !== 'package.json'))
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
export function validateManifest(m) {
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
  if (m.mode === 'ota') {
    for (const platform of ['ios', 'android']) {
      invariant(
        m.ota.updates[platform]?.commitHash === m.sha,
        `Missing ${platform} OTA identity`,
      )
      invariant(
        m.ota.updates[platform]?.updateId,
        `Missing ${platform} update ID`,
      )
    }
  } else {
    for (const platform of ['ios', 'android']) {
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
