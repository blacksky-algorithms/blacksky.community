import {appendFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {GitHub} from './github.mjs'
import {
  assertCurrent,
  digest,
  invariant,
  required,
  output,
  save,
} from './core.mjs'
import {OTA} from './ota.mjs'
import {deployWeb, snapshotWeb, targets, verifyWeb} from './web.mjs'
import {fastlane, releaseApple} from './stores.mjs'

const gh = new GitHub()
const operation = required('RELEASE_OPERATION')
const releaseId = required('RELEASE_ID')
const asset = required('CANDIDATE_ASSET')
const hash = required('MANIFEST_HASH')
const m = await gh.asset(releaseId, asset)
const key = p =>
  p.manifestHash === hash &&
  p.sha === m.sha &&
  String(p.releaseId) === releaseId
const published = await gh.succeeded('published', key)

async function validate() {
  assertCurrent(m, operation === 'rollback' ? m.sha : await gh.head(m.branch), hash)
  if (operation !== 'rollback' && !published) {
    const latestQA = await gh.succeeded('qa', p => p.branch === m.branch)
    invariant(latestQA && key(latestQA.payload) && latestQA.payload.assetName === asset, 'A newer candidate replaced this approval request')
    invariant(!await gh.succeeded('published', p => p.branch === m.branch), 'This train already released another candidate')
    invariant(!await gh.succeeded('discarded', p => p.branch === m.branch), 'This train was discarded')
  }
  invariant(
    digest(m.config.production) ===
      digest(targets('RELEASE_PRODUCTION_TARGETS')),
    'Production targets changed; generate a new approval request',
  )
  invariant(
    m.config.otaUrl === required('RELEASE_OTA_URL'),
    'OTA endpoint changed since QA',
  )
  invariant(
    m.config.iosDestination === required('RELEASE_IOS_DESTINATION'),
    'Store destination changed since QA',
  )
  invariant(m.config.stores.appId === required('ASC_APP_ID') && m.config.stores.appIdentifier === required('RELEASE_APP_IDENTIFIER') && m.config.stores.publicTestFlightGroup === (process.env.RELEASE_PUBLIC_TESTFLIGHT_GROUP || null), 'Store identity changed since candidate approval')
  if (!published && operation !== 'rollback') await gh.checks(m.sha)
}
async function preflight() {
  invariant(
    process.env.GITHUB_REF === 'refs/heads/main',
    'Promotion workflow must run from main',
  )
  await gh.protectEnvironment()
  await validate()
  const approval = await gh.succeeded('approved', key)
  output('needs_approval', !approval || operation === 'rollback')
  output('done', Boolean(published) && operation !== 'rollback')
  output('mode', m.mode)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Candidate: ${m.sha}\n\nManifest: ${hash}\n\nMobile: ${m.mode}, runtime ${m.runtimeVersion}\n\nWeb QA: ${m.config.staging.flatMap(t => t.urls).join(', ')}\n\nApprove this exact candidate for mobile and web together.\n`,
    )
}
async function approve() {
  await validate()
  await gh.event(
    {sha: m.sha, branch: m.branch, manifestHash: hash, releaseId, operation},
    operation === 'rollback' ? 'rollback-approved' : 'approved',
    'success',
  )
}
async function execute() {
  await validate()
  invariant(
    await gh.succeeded(
      operation === 'rollback' ? 'rollback-approved' : 'approved',
      key,
    ),
    'No approval for this manifest',
  )
  if (published && operation !== 'rollback') {
    console.log('Candidate already published')
    return
  }
  const ota = new OTA()
  if (operation !== 'rollback') {
    if (m.mode === 'ota') {await ota.verify(m.ota, m.sha); await ota.verifyArtifacts(m.ota)}
    for (const target of m.config.staging) await verifyWeb(target, m.web)
  }
  const receipt = {sha: m.sha, branch: m.branch, manifestHash: hash, releaseId}
  if (operation === 'rollback') {
    invariant(
      m.mode === 'ota',
      'Native rollback requires a new binary or store rollout intervention',
    )
    const latest = await gh.succeeded('published', () => true)
    const snapshotReceipt = await gh.succeeded('rollback-snapshot', key)
    const partial = (await gh.events('partial-promotion')).find(d => key(d.payload))
    invariant((latest && key(latest.payload)) || (partial && snapshotReceipt && (!latest || latest.created_at < snapshotReceipt.created_at)), 'Rollback request is not for the current or partially promoted release')
    const rollback = invariant(
      (await gh.succeeded('rollback-snapshot', key))?.payload.rollback,
      'Rollback snapshot missing',
    )
    for (const {target, web} of rollback.web) await deployWeb(target, web)
    await ota.map('production', rollback.ota.branchId)
    await gh.event(receipt, 'rolled-back', 'success')
    return
  }
  let snapshot = await gh.succeeded('rollback-snapshot', key)
  if (!snapshot) {
    const previous = []
    for (const target of m.config.production) {
      const state = await snapshotWeb(target)
      const response = await fetch(new URL('/_release', target.urls[0]), {
        signal: AbortSignal.timeout(30000),
      })
      invariant(
        response.ok,
        'Bootstrap production /_release before enabling automated promotion',
      )
      const identity = await response.json()
      const previousDigest =
        typeof state.image === 'string'
          ? state.image.split('@')[1]
          : state.image.digest
      invariant(
        /^sha256:[a-f0-9]{64}$/.test(previousDigest || ''),
        'Pin the initial production digest before activation',
      )
      previous.push({
        target,
        web: {
          ...identity,
          repository: m.web.repository,
          digest: previousDigest,
        },
      })
    }
    const priorChannel = await ota.channel('production')
    invariant(
      priorChannel.branchId,
      'Production OTA channel must have a rollback branch',
    )
    snapshot = await gh.event(
      {...receipt, rollback: {web: previous, ota: priorChannel}},
      'rollback-snapshot',
      'success',
    )
  }
  if (m.mode === 'native') {
    if (!(await gh.succeeded('native-submitted', key))) {
      mkdirSync('release-metadata/en-US', {recursive: true})
      writeFileSync('release-metadata/en-US/release_notes.txt', m.releaseNotes)
      fastlane('submit_candidate', m)
      await gh.event(receipt, 'native-submitted', 'success')
    }
    if (operation !== 'finish-native') {
      console.log(
        'Submitted native artifacts. After store review, run finish-native with storefront readiness evidence; the recorded approval is reused.',
      )
      return
    }
    const evidence = new URL(required('STORE_READY_EVIDENCE'))
    invariant(
      evidence.protocol === 'https:',
      'Store readiness evidence must be an HTTPS link',
    )
    fastlane('verify_play', m)
    if (m.config.iosDestination === 'app-store') {
      if (!(await releaseApple(m))) {
        console.log(
          'iOS release requested or still processing; resume finish-native after availability is confirmed. Web remains held.',
        )
        return
      }
    } else fastlane('publish_testflight', m)
  }
  try {
    await validate()
    for (const target of m.config.production) {
      if (!(await gh.succeeded(`web-${target.name}`, key))) {
        await deployWeb(target, m.web)
        await gh.event(receipt, `web-${target.name}`, 'success')
      } else await verifyWeb(target, m.web)
    }
    if (m.mode === 'ota') {
      await ota.verify(m.ota, m.sha)
      await ota.verifyArtifacts(m.ota)
      await ota.map('production', m.ota.branchId)
    }
    invariant(
      (await gh.head(m.branch)) === m.sha,
      'QA fix landed during promotion; release requires reconciliation',
    )
    const nativeBaseline =
      m.mode === 'native'
        ? {
            sha: m.sha,
            runtimeVersion: m.runtimeVersion,
            ios: m.ios,
            android: m.android,
          }
        : m.nativeBaseline
    if (m.mode === 'native') {
      try {
        await gh.request('git/refs', {
          ref: `refs/tags/blacksky-v${m.runtimeVersion}`,
          sha: m.sha,
        })
      } catch (error) {
        if (error.status !== 422) throw error
        invariant(
          (await gh.request(`git/ref/tags/blacksky-v${m.runtimeVersion}`))
            .object.sha === m.sha,
          'Native version tag collision',
        )
      }
    }
    await gh.request(
      `releases/${releaseId}`,
      {
        tag_name: `blacksky-release-${m.branch.slice(8)}`,
        target_commitish: m.sha,
        name: `Release ${m.branch.slice(8)}`,
        draft: false,
        prerelease: false,
      },
      'PATCH',
    )
    await gh.event(
      {...receipt, sourceSha: m.sourceSha, nativeBaseline, web: m.web},
      'published',
      'success',
    )
  } catch (error) {
    await gh.event(receipt, 'partial-promotion', 'failure', error.message)
    throw error
  }
}
const command = process.argv[2]
if (command === 'preflight') await preflight()
else if (command === 'approve') await approve()
else if (command === 'execute') await execute()
else throw new Error('Unknown promotion command')
