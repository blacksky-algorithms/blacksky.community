import test from 'node:test'
import assert from 'node:assert/strict'
import {GitHub} from './github.mjs'
import {OTA} from './ota.mjs'
import {targets, deployWeb, separateTargets} from './web.mjs'

const sha = 'a'.repeat(40)
function mock(t, handler) {
  const original = global.fetch
  global.fetch = async (url, options = {}) => {
    const value = await handler(String(url), options)
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: {'content-type': 'application/json'},
    })
  }
  t.after(() => {
    global.fetch = original
  })
}
test('OTA mapping resolves both IDs, supports multiple channels, and reads back', async t => {
  process.env.RELEASE_OTA_URL = 'https://ota.example/manifest'
  process.env.EXPO_TOKEN = 'test-only'
  let target = 'old-branch'
  mock(t, (url, options) => {
    if (url.endsWith('/channels'))
      return [
        {
          releaseChannelName: 'production',
          releaseChannelId: 'channel-id',
          branchId: target,
        },
        {
          releaseChannelName: 'release-qa',
          releaseChannelId: 'qa-id',
          branchId: 'candidate-id',
        },
      ]
    assert.match(url, /branch\/candidate-id\/updateChannelBranchMapping$/)
    assert.deepEqual(JSON.parse(options.body), {releaseChannel: 'channel-id'})
    target = 'candidate-id'
    return 'ok'
  })
  await new OTA().map('production', 'candidate-id')
  assert.equal(target, 'candidate-id')
})
test('OTA verification rejects another upload even if branch name is unchanged', async t => {
  process.env.RELEASE_OTA_URL = 'https://ota.example'
  process.env.EXPO_TOKEN = 'test-only'
  let extra = false
  mock(t, url => {
    if (url.endsWith('/branches'))
      return [{branchName: 'candidate', branchId: 'id'}]
    if (url.endsWith('/updates'))
      return [
        {updateId: '1', updateUUID: 'uuid-1', commitHash: sha, platform: 'ios'},
        {
          updateId: '2',
          updateUUID: 'uuid-2',
          commitHash: sha,
          platform: 'android',
        },
        ...(extra ? [{updateId: '3', commitHash: sha, platform: 'ios'}] : []),
      ]
    return {
      expoConfig: JSON.stringify({version: '1.0.0'}),
      updateId: url.split('/').at(-1),
    }
  })
  const ota = new OTA()
  const snapshot = await ota.snapshot('candidate', '1.0.0', sha)
  await ota.verify(snapshot, sha)
  extra = true
  await assert.rejects(() => ota.verify(snapshot, sha), /exactly one/)
})
test('missing approval environment reviewers fails closed', async t => {
  mock(t, () => ({protection_rules: []}))
  await assert.rejects(
    () => new GitHub('test', 'owner/repo').protectEnvironment(),
    /reviewers/,
  )
})
test('missing or insecure target configuration is rejected', () => {
  process.env.TEST_TARGETS = JSON.stringify([
    {
      kind: 'app',
      name: 'web',
      appId: 'a',
      component: 'web',
      urls: ['http://example.com'],
    },
  ])
  assert.throws(() => targets('TEST_TARGETS'), /HTTPS/)
  process.env.TEST_TARGETS = '[]'
  assert.throws(() => targets('TEST_TARGETS'), /every target/)
})
test('web deployment pins approved digest, disables autodeploy, and verifies live identity', async t => {
  process.env.DIGITALOCEAN_ACCESS_TOKEN = 'test-only'
  const target = {
    kind: 'app',
    appId: 'app',
    component: 'web',
    name: 'web',
    urls: ['https://web.example'],
  }
  const web = {
    repository: 'registry.digitalocean.com/registry/image',
    digest: `sha256:${'b'.repeat(64)}`,
    sha,
    version: '1.0.0',
  }
  let spec = {
    services: [
      {
        name: 'web',
        image: {
          registry_type: 'DOCR',
          registry: 'registry',
          repository: 'image',
          tag: 'latest',
          deploy_on_push: true,
        },
      },
    ],
  }
  let updated = false
  mock(t, (url, options) => {
    if (url.endsWith('/apps/app') && options.method === 'PUT') {
      spec = JSON.parse(options.body).spec
      assert.equal(spec.services[0].image.digest, web.digest)
      assert.equal(spec.services[0].image.deploy_on_push, false)
      assert.equal(spec.services[0].image.tag, undefined)
      updated = true
      return {app: {in_progress_deployment: {id: 'new'}}}
    }
    if (url.endsWith('/apps/app'))
      return {app: {spec, active_deployment: {id: updated ? 'new' : 'old'}}}
    if (url.endsWith('/deployments/new')) return {deployment: {phase: 'ACTIVE'}}
    if (url.endsWith('/_release')) return {sha, version: '1.0.0'}
    return {}
  })
  await deployWeb(target, web)
  assert.equal(updated, true)
})

test('QA refuses production components or hostnames as staging targets', () => {
  const production = [
    {
      kind: 'app',
      appId: 'prod',
      component: 'web',
      urls: ['https://prod.example'],
    },
  ]
  assert.throws(
    () => separateTargets(production, production),
    /must be separate/,
  )
  assert.throws(
    () => separateTargets([{...production[0], appId: 'stage'}], production),
    /must be separate/,
  )
  assert.doesNotThrow(() =>
    separateTargets(
      [{...production[0], appId: 'stage', urls: ['https://qa.example']}],
      production,
    ),
  )
})
