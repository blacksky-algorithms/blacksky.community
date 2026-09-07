import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {OTA} from './ota.mjs'
import {submitNative} from './stores.mjs'
import {rollbackRelease} from './rollback.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('base64url')
test('OTA verifies served manifests and bytes on both channels, rejecting changed bytes', async t => {
  process.env.RELEASE_OTA_URL = 'https://ota.example'
  process.env.EXPO_TOKEN = 'test'
  const original = global.fetch
  t.after(() => {
    global.fetch = original
  })
  let bytes = 'tested bundle'
  const snapshot = {
    branchId: 'candidate',
    runtimeVersion: '1.0.0',
    updates: {ios: {updateUUID: 'ios-id'}, android: {updateUUID: 'android-id'}},
  }
  const channels = []
  global.fetch = async (url, options) => {
    if (String(url).endsWith('/api/channels'))
      return Response.json(
        ['release-qa', 'production'].map(releaseChannelName => ({
          releaseChannelName,
          branchId: 'candidate',
        })),
      )
    if (String(url).endsWith('/manifest')) {
      const platform = options.headers['expo-platform']
      channels.push(options.headers['expo-channel-name'])
      const manifest = {
        id: `${platform}-id`,
        runtimeVersion: '1.0.0',
        launchAsset: {
          url: 'https://ota.example/asset',
          hash: hash('tested bundle'),
        },
        assets: [],
      }
      return new Response(
        `--boundary\r\nContent-Disposition: form-data; name="manifest"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(manifest)}\r\n--boundary--\r\n`,
        {headers: {'content-type': 'multipart/mixed; boundary="boundary"'}},
      )
    }
    assert.equal(options.redirect, 'error')
    return new Response(bytes)
  }
  const ota = new OTA()
  snapshot.artifacts = await ota.artifacts(snapshot)
  await ota.verifyArtifacts(snapshot)
  await ota.verifyArtifacts(snapshot, 'production')
  assert.ok(channels.includes('production'))
  bytes = 'replaced after approval'
  await assert.rejects(() => ota.verifyArtifacts(snapshot), /bytes differ/)
})
test('store retry preserves completed platform and reconciles an iOS submission with a lost receipt', async () => {
  const done = new Set()
  let appleSubmitted = false
  let failReceipt = true
  const calls = []
  const gh = {
    succeeded: async task => done.has(task),
    event: async (_, task) => {
      if (failReceipt) {
        failReceipt = false
        throw new Error('receipt unavailable')
      }
      done.add(task)
    },
  }
  const adapters = {
    appleVersion: async () =>
      appleSubmitted
        ? {attributes: {appStoreState: 'WAITING_FOR_REVIEW'}}
        : null,
    fastlane: lane => {
      calls.push(lane)
      if (lane === 'submit_ios') appleSubmitted = true
    },
  }
  const m = {config: {iosDestination: 'app-store'}}
  await assert.rejects(
    () => submitNative(gh, m, {}, () => true, adapters),
    /receipt unavailable/,
  )
  await submitNative(gh, m, {}, () => true, adapters)
  await submitNative(gh, m, {}, () => true, adapters)
  assert.deepEqual(calls, ['submit_ios', 'submit_android'])
})
test('Android failure resumes without submitting iOS again', async () => {
  const done = new Set()
  const calls = []
  let failed = false
  const gh = {
    succeeded: async task => done.has(task),
    event: async (_, task) => done.add(task),
  }
  const adapters = {
    appleVersion: async () => null,
    fastlane: lane => {
      calls.push(lane)
      if (lane === 'submit_android' && !failed) {
        failed = true
        throw new Error('Play unavailable')
      }
    },
  }
  const m = {config: {iosDestination: 'app-store'}}
  await assert.rejects(
    () => submitNative(gh, m, {}, () => true, adapters),
    /Play unavailable/,
  )
  await submitNative(gh, m, {}, () => true, adapters)
  assert.deepEqual(calls, ['submit_ios', 'submit_android', 'submit_android'])
})
function rollbackFixture() {
  const candidate = {
    ota: {branchId: 'new'},
    web: {repository: 'registry/image', digest: 'new-digest'},
  }
  const old = {
    repository: 'registry/image',
    digest: 'old-digest',
    sha: 'old-sha',
  }
  const rollback = {
    ota: {
      branchId: 'old',
      artifacts: {ios: {assets: []}, android: {assets: []}},
    },
    web: [
      {target: {name: 'a'}, web: old},
      {target: {name: 'b'}, web: old},
    ],
  }
  const changes = []
  const ota = {
    channel: async name => {
      assert.equal(name, 'production')
      return {branchId: 'new'}
    },
    verify: async () => {},
    hashAssets: async () => {},
    map: async (...args) => changes.push(args),
    verifyArtifacts: async (_, channel) => assert.equal(channel, 'production'),
  }
  const adapters = {
    snapshotWeb: async target => ({
      image: `registry/image@${target.name === 'a' ? 'new' : 'old'}-digest`,
    }),
    deployWeb: async target => changes.push(target.name),
  }
  return {candidate, rollback, changes, ota, adapters}
}
test('partial web promotion rolls back without depending on current QA staging', async () => {
  const f = rollbackFixture()
  await rollbackRelease(f.ota, f.candidate, f.rollback, f.adapters)
  assert.deepEqual(f.changes, ['a', 'b', ['production', 'old']])
})
test('rollback rejects unrelated production drift before making any changes', async () => {
  const f = rollbackFixture()
  f.adapters.snapshotWeb = async () => ({
    image: 'registry/image@unrelated-digest',
  })
  await assert.rejects(
    () => rollbackRelease(f.ota, f.candidate, f.rollback, f.adapters),
    /unrelated release/,
  )
  assert.deepEqual(f.changes, [])
})
