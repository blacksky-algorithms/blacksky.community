import {appendFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {GitHub} from './github.mjs'
import {assertCurrent, digest, invariant, required, output} from './core.mjs'
import {OTA} from './ota.mjs'
import {deployWeb, snapshotWeb, targets, verifyWeb} from './web.mjs'
import {fastlane, releaseApple, submitNative} from './stores.mjs'
import {rollbackRelease} from './rollback.mjs'

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
  assertCurrent(
    m,
    operation === 'rollback' ? m.sha : await gh.head(m.branch),
    hash,
  )
  if (operation !== 'rollback' && !published) {
    const latestQA = await gh.succeeded('qa', p => p.branch === m.branch)
    invariant(
      latestQA && key(latestQA.payload) && latestQA.payload.assetName === asset,
      'A newer candidate replaced this approval request',
    )
    invariant(
      !(await gh.succeeded('published', p => p.branch === m.branch)),
      'This train already released another candidate',
    )
    invariant(
      !(await gh.succeeded('discarded', p => p.branch === m.branch)),
      'This train was discarded',
    )
    invariant(
      !(await gh.succeeded('rolled-back', key)),
      'This candidate was rolled back; prepare and approve a new candidate',
    )
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
  invariant(
    m.config.stores.appId === required('ASC_APP_ID') &&
      m.config.stores.appIdentifier === required('RELEASE_APP_IDENTIFIER') &&
      m.config.stores.publicTestFlightGroup ===
        (process.env.RELEASE_PUBLIC_TESTFLIGHT_GROUP || null),
    'Store identity changed since candidate approval',
  )
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
    await ota.verify(m.ota, m.sha)
    await ota.verifyArtifacts(m.ota)
    for (const target of m.config.staging) await verifyWeb(target, m.web)
  }
  const receipt = {sha: m.sha, branch: m.branch, manifestHash: hash, releaseId}
  if (operation === 'rollback') {
    invariant(
      m.mode === 'ota',
      'Native rollback requires a new binary or store rollout intervention',
    )
    if (await gh.succeeded('rolled-back', key)) return
    const latest = await gh.succeeded('promotion-started', () => true)
    invariant(
      latest && key(latest.payload),
      'A newer promotion owns production; rollback refused',
    )
    const rollback = invariant(
      (await gh.succeeded('rollback-snapshot', key))?.payload.rollback,
      'Rollback snapshot missing',
    )
    await rollbackRelease(ota, m, rollback)
    await gh.event(receipt, 'rolled-back', 'success')
    return
  }
  await gh.event(receipt, 'promotion-started', 'success')
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
      const previousDigest = state.image.split('@')[1]
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
    for (const {target, web} of previous) await verifyWeb(target, web)
    const priorChannel = await ota.channel('production')
    invariant(
      priorChannel.branchId,
      'Production OTA channel must have a rollback branch',
    )
    invariant(
      previous.every(
        p =>
          p.web.sha === previous[0].web.sha &&
          p.web.version === previous[0].web.version,
      ),
      'Production targets disagree before promotion',
    )
    const priorOTA = await ota.snapshot(
      priorChannel.branchName,
      previous[0].web.version,
      previous[0].web.sha,
    )
    priorOTA.artifacts = await ota.artifacts(priorOTA, 'production')
    snapshot = await gh.event(
      {...receipt, rollback: {web: previous, ota: priorOTA}},
      'rollback-snapshot',
      'success',
    )
  }
  try {
    if (m.mode === 'native') {
      mkdirSync('release-metadata/en-US', {recursive: true})
      writeFileSync('release-metadata/en-US/release_notes.txt', m.releaseNotes)
      await submitNative(gh, m, receipt, key)
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
      await gh.event(
        {...receipt, evidence: evidence.href},
        'store-readiness',
        'success',
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
    await validate()
    for (const target of m.config.production) {
      if (!(await gh.succeeded(`web-${target.name}`, key))) {
        await deployWeb(target, m.web)
        await gh.event(receipt, `web-${target.name}`, 'success')
      } else await verifyWeb(target, m.web)
    }
    {
      await ota.verify(m.ota, m.sha)
      await ota.verifyArtifacts(m.ota)
      await ota.map('production', m.ota.branchId)
      await ota.verifyArtifacts(m.ota, 'production')
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
    if (m.mode === 'native')
      await gh.tag(`blacksky-v${m.runtimeVersion}`, m.sha)
    await gh.tag(`blacksky-release-${m.branch.slice(8)}`, m.sha)
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
