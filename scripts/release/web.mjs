import childProcess from 'node:child_process'
import {invariant, required} from './core.mjs'

export function targets(name) {
  const value = JSON.parse(required(name))
  invariant(
    Array.isArray(value) && value.length > 0,
    `${name} must list every target`,
  )
  const ids = new Set()
  for (const target of value) {
    invariant(
      target.kind === 'app' || target.kind === 'kubernetes',
      'Unknown deployment target',
    )
    invariant(
      target.name && !ids.has(target.name),
      'Target names must be unique',
    )
    ids.add(target.name)
    invariant(
      Array.isArray(target.urls) &&
        target.urls.length > 0 &&
        target.urls.every(u => new URL(u).protocol === 'https:'),
      'Each target needs HTTPS verification URLs',
    )
    if (target.kind === 'app')
      invariant(target.appId && target.component, 'Missing app target identity')
    else
      invariant(
        target.namespace && target.deployment && target.container,
        'Missing Kubernetes target identity',
      )
  }
  return value
}
export function separateTargets(staging, production) {
  const identity = t =>
    t.kind === 'app'
      ? `app:${t.appId}:${t.component}`
      : `kubernetes:${t.namespace}:${t.deployment}:${t.container}`
  const productionIds = new Set(production.map(identity))
  const productionOrigins = new Set(
    production.flatMap(t => t.urls.map(u => new URL(u).origin)),
  )
  invariant(
    staging.every(
      t =>
        !productionIds.has(identity(t)) &&
        t.urls.every(u => !productionOrigins.has(new URL(u).origin)),
    ),
    'Staging and production targets must be separate',
  )
}

export async function doRequest(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`https://api.digitalocean.com/v2/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${required('DIGITALOCEAN_ACCESS_TOKEN')}`,
      'content-type': 'application/json',
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(60000),
  })
  invariant(response.ok, `DigitalOcean ${method}: HTTP ${response.status}`)
  return response.json()
}
async function imageReference(image) {
  invariant(image.registry_type === 'DOCR', 'Expected DOCR service')
  const registry = image.registry || (await doRequest('registry')).registry.name
  return `registry.digitalocean.com/${registry}/${image.repository}@${image.digest}`
}
function kube(...args) {
  return childProcess.execFileSync('kubectl', args, {
    encoding: 'utf8',
    timeout: 600000,
  })
}
export async function snapshotWeb(target) {
  if (target.kind === 'app') {
    const {app} = await doRequest(`apps/${target.appId}`)
    const service = invariant(
      app.spec.services?.find(s => s.name === target.component),
      'App component not found',
    )
    return {target, image: await imageReference(service.image)}
  }
  const deployment = JSON.parse(
    kube(
      '-n',
      target.namespace,
      'get',
      'deployment',
      target.deployment,
      '-o',
      'json',
    ),
  )
  const container = invariant(
    deployment.spec.template.spec.containers.find(
      c => c.name === target.container,
    ),
    'Container not found',
  )
  return {target, image: container.image}
}
export async function verifyWeb(target, expected) {
  const state = await snapshotWeb(target)
  const image = state.image
  invariant(
    image === `${expected.repository}@${expected.digest}`,
    'Deployed image differs from approved digest',
  )
  for (const url of target.urls) {
    const response = await fetch(new URL('/_release', url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    })
    invariant(response.ok, `Release identity unavailable at ${url}`)
    const identity = await response.json()
    invariant(
      identity.sha === expected.sha,
      `Unexpected deployed SHA at ${url}`,
    )
    invariant(
      identity.version === expected.version,
      `Unexpected deployed version at ${url}`,
    )
    const health = await fetch(url, {signal: AbortSignal.timeout(30000)})
    invariant(health.ok, `Health check failed at ${url}`)
  }
}
export async function deployWeb(target, web) {
  if (target.kind === 'app') {
    const {app} = await doRequest(`apps/${target.appId}`)
    const service = invariant(
      app.spec.services?.find(s => s.name === target.component),
      'App component missing',
    )
    const image = invariant(service.image, 'App is not image-based')
    const currentRepo = (await imageReference(image)).split('@')[0]
    invariant(
      currentRepo === web.repository,
      'Target registry repository differs from approved artifact',
    )
    service.image = {
      ...image,
      digest: web.digest,
      deploy_on_push: {enabled: false},
    }
    delete service.image.tag
    childProcess.execFileSync(
      'doctl',
      ['apps', 'update', target.appId, '--spec', '-', '--wait'],
      {
        input: JSON.stringify(app.spec),
        timeout: 1200000,
        stdio: ['pipe', 'ignore', 'inherit'],
      },
    )
  } else {
    const image = `${web.repository}@${web.digest}`
    kube(
      '-n',
      target.namespace,
      'set',
      'image',
      `deployment/${target.deployment}`,
      `${target.container}=${image}`,
    )
    kube(
      '-n',
      target.namespace,
      'rollout',
      'status',
      `deployment/${target.deployment}`,
      '--timeout=600s',
    )
  }
  await verifyWeb(target, web)
}
