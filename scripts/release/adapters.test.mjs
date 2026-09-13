import test from 'node:test'
import childProcess from 'node:child_process'
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
test('OTA mapping resolves both IDs, supports multiple channels', async t => {
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
          repository: 'image',
          tag: 'latest',
          deploy_on_push: {enabled: true},
        },
      },
    ],
  }
  let updated = false
  mock(t, (url, options) => {
    if (url.endsWith('/v2/registry')) return {registry: {name: 'registry'}}
    if (url.endsWith('/apps/app'))
      return {app: {spec, active_deployment: {id: updated ? 'new' : 'old'}}}
    if (url.endsWith('/deployments/new')) return {deployment: {phase: 'ACTIVE'}}
    if (url.endsWith('/_release')) return {sha, version: '1.0.0'}
    return {}
  })
  t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    assert.equal(command, 'doctl')
    assert.deepEqual(args, ['apps', 'update', 'app', '--spec', '-', '--wait'])
    spec = JSON.parse(options.input)
    assert.equal(spec.services[0].image.digest, web.digest)
    assert.deepEqual(spec.services[0].image.deploy_on_push, {enabled: false})
    assert.equal(spec.services[0].image.tag, undefined)
    updated = true
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

test('Kubernetes rollout pins the tested image and verifies its served identity', async t => {
  const target = {
    kind: 'kubernetes',
    namespace: 'qa',
    deployment: 'web',
    container: 'web',
    urls: ['https://qa.example'],
  }
  const web = {
    repository: 'registry.digitalocean.com/test/web',
    digest: `sha256:${'b'.repeat(64)}`,
    sha,
    version: '1.0.0',
  }
  let image = 'old'
  const calls = []
  t.mock.method(childProcess, 'execFileSync', (command, args) => {
    assert.equal(command, 'kubectl')
    calls.push(args)
    if (args[2] === 'set') image = args.at(-1).slice(4)
    if (args[2] === 'get')
      return JSON.stringify({
        spec: {template: {spec: {containers: [{name: 'web', image}]}}},
      })
    return ''
  })
  mock(t, () => ({sha, version: web.version}))
  await deployWeb(target, web)
  assert.equal(image, `${web.repository}@${web.digest}`)
  assert.ok(
    calls.some(
      args =>
        args.join(' ') === '-n qa rollout status deployment/web --timeout=600s',
    ),
  )
})
