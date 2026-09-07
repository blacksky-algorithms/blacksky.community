import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allocateBuildNumber,
  assertCurrent,
  androidRuntimeResource,
  chooseChecks,
  compareVersions,
  digest,
  nextVersion,
  releaseBranch,
  requiresNative,
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
    artifacts: Object.fromEntries(
      ['ios', 'android'].map(p => [
        p,
        {
          manifestHash: 'a'.repeat(64),
          assets: [{url: 'https://ota.example/asset', hash: 'test'}],
        },
      ]),
    ),
    updates: {
      ios: {commitHash: sha, updateId: 'ios-1'},
      android: {commitHash: sha, updateId: 'android-1'},
    },
  },
})

test('RN source and web fixes use OTA; native configuration or unknown inputs require binary', () => {
  assert.equal(
    requiresNative([
      'src/view/Foo.tsx',
      'src/state/bar.ts',
      'assets/photos/card.png',
      'bskyweb/cmd/bskyweb/server.go',
    ]),
    false,
  )
  for (const path of [
    'app.config.js',
    'eas.json',
    'package.json',
    'pnpm-lock.yaml',
    'modules/foo/ios/View.swift',
    'android/app/build.gradle',
    'assets/fonts/font.otf',
    'patches/expo.patch',
    'unknown-config',
  ])
    assert.equal(requiresNative([path]), true, path)
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

test('Android compiled runtime references resolve only an unqualified string', () => {
  const resource = `Package 'community.test':\n0x7f010001 - string/expo_runtime_version\n\t(default) - [STR] "1.2.3"\n`
  assert.equal(androidRuntimeResource(resource), '1.2.3')
  assert.throws(
    () => androidRuntimeResource(resource + '\tfr - [STR] "1.2.4"\n'),
    /one unqualified/,
  )
  assert.throws(
    () => androidRuntimeResource('\t(default) - [REF] 0x7f000002\n'),
    /Invalid/,
  )
})

test('native build allocation distinguishes retries and rejects exhausted or overlapping ranges', () => {
  assert.equal(allocateBuildNumber('1000', '10', '1'), 2001)
  assert.equal(allocateBuildNumber('1000', '10', '2'), 2002)
  for (const values of [
    [0, 1, 100],
    [0, 1, 0],
    [2100000000, 1, 1],
    ['invalid', 1, 1],
  ])
    assert.throws(() => allocateBuildNumber(...values))
})
