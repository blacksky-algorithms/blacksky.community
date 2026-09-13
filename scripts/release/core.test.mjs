import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCurrent,
  candidatePointer,
  chooseChecks,
  compareVersions,
  digest,
  nextVersion,
  releaseBranch,
  validateManifest,
} from './core.mjs'

const sha = 'a'.repeat(40)
const candidate = () => ({
  schema: 1,
  branch: 'release/2026-09-14-12',
  sha,
  mode: 'ota',
  runtimeVersion: '1.127.2',
  config: {stores: {appIdentifier: 'community.test'}},
  web: {
    sha,
    appIdentifier: 'community.test',
    version: '1.127.2',
    digest: `sha256:${'b'.repeat(64)}`,
  },
  ota: {
    runtimeVersion: '1.127.2',
    updates: {
      ios: {commitHash: sha, updateId: 'ios-1'},
      android: {commitHash: sha, updateId: 'android-1'},
    },
  },
})

test('future trains cannot reuse an older main native version', () => {
  assert.equal(nextVersion('1.127.2', '1.127.5'), '1.127.6')
  assert.equal(nextVersion('1.130.0', '1.127.5'), '1.130.1')
  assert.equal(compareVersions('1.127.2', '1.127.2'), 0)
  assert.throws(() => nextVersion('garbage', '1.0.0'))
})
test('exact manifest and release head are checked after human approval', () => {
  const m = candidate(),
    hash = digest(m)
  assert.doesNotThrow(() => assertCurrent(m, sha, hash))
  assert.throws(() => assertCurrent(m, 'c'.repeat(40), hash), /superseded/)
  m.web.digest = `sha256:${'d'.repeat(64)}`
  assert.throws(() => assertCurrent(m, sha, hash), /changed/)
})
test('a candidate cannot pair different mobile/web SHAs or mutable images', () => {
  const m = candidate()
  m.ota.updates.android.commitHash = 'f'.repeat(40)
  assert.throws(() => validateManifest(m), /android/)
  m.ota.updates.android.commitHash = sha
  m.web.digest = 'latest'
  assert.throws(() => validateManifest(m), /digest/)
})
test('native candidate must have both binaries and correct version', () => {
  const m = {...candidate(), mode: 'native'}
  assert.throws(() => validateManifest(m), /ios/)
  m.ios = {
    sha,
    appIdentifier: 'community.test',
    version: '1.127.2',
    checksum: 'f'.repeat(64),
  }
  m.android = {
    sha,
    appIdentifier: 'community.test',
    version: '1.127.1',
    checksum: 'f'.repeat(64),
  }
  assert.throws(() => validateManifest(m), /version/)
  m.android.version = '1.127.2'
  assert.doesNotThrow(() => validateManifest(m))
})
test('CI uses latest trusted check attempt, rejects skipped or failed, and waits for absent', () => {
  const run = (id, conclusion, app = 'github-actions') => ({
    id,
    name: 'tests',
    status: 'completed',
    conclusion,
    app: {slug: app},
  })
  assert.deepEqual(
    chooseChecks([run(1, 'success'), run(2, 'failure')], ['tests']),
    ['failure'],
  )
  assert.deepEqual(
    chooseChecks(
      [run(1, 'success'), run(2, 'success', 'untrusted')],
      ['tests', 'lint'],
    ),
    ['success', 'pending'],
  )
  assert.deepEqual(chooseChecks([run(1, 'skipped')], ['tests']), ['failure'])
})
test('release branch validation rejects shell and ref injection', () => {
  for (const bad of [
    'main',
    'release/a',
    'release/2026-09-14;echo bad',
    '../main',
    'release/2026-09-14\nmain',
  ])
    assert.throws(() => releaseBranch(bad))
  assert.equal(releaseBranch('release/2026-09-14'), 'release/2026-09-14')
})

test('manifest hashing is independent of object key ordering but binds values and array order', () => {
  assert.equal(digest({a: 1, b: {c: 2, d: 3}}), digest({b: {d: 3, c: 2}, a: 1}))
  assert.notEqual(digest([1, 2]), digest([2, 1]))
  assert.notEqual(digest({a: 1}), digest({a: 2}))
})
test('current candidate pointer includes immutable asset and hash', () => {
  const body = `Manifest: candidate-${sha}-12-1.json\nManifest SHA-256: ${'b'.repeat(64)}`
  assert.deepEqual(candidatePointer(body), {
    asset: `candidate-${sha}-12-1.json`,
    hash: 'b'.repeat(64),
  })
  assert.throws(() => candidatePointer('old draft'), /pointer/)
})
