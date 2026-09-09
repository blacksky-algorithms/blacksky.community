import {appendFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {GitHub} from './github.mjs'
import {
  assertCurrent,
  candidatePointer,
  digest,
  invariant,
  required,
  output,
  branchDate,
  releaseTag,
} from './core.mjs'
import {OTA} from './ota.mjs'
import {deployWeb, targets, verifyWeb} from './web.mjs'

const gh = new GitHub()
const releaseId = required('RELEASE_ID')
const asset = required('CANDIDATE_ASSET')
const hash = required('MANIFEST_HASH')
const m = await gh.asset(releaseId, asset)

async function validate() {
  assertCurrent(m, await gh.head(m.branch), hash)
  const release = await gh.request(`releases/${releaseId}`)
  const pointer = candidatePointer(release.body)
  invariant(
    release.draft && pointer.asset === asset && pointer.hash === hash,
    'A newer candidate replaced this approval request, or the train is already published',
  )
  invariant(
    digest(m.config.production) ===
      digest(targets('RELEASE_PRODUCTION_TARGETS')),
    'Production targets changed; prepare a new candidate',
  )
  invariant(
    m.config.otaUrl === required('RELEASE_OTA_URL'),
    'OTA endpoint changed since QA',
  )
  invariant(
    m.config.iosDestination === required('RELEASE_IOS_DESTINATION') &&
      m.config.stores.appId === required('ASC_APP_ID') &&
      m.config.stores.appIdentifier === required('RELEASE_APP_IDENTIFIER') &&
      m.config.stores.publicTestFlightGroup ===
        (process.env.RELEASE_PUBLIC_TESTFLIGHT_GROUP || null),
    'Store destination changed since QA',
  )
}
await validate()
if (process.argv[2] === 'preflight') {
  await gh.protectEnvironment()
  output('mode', m.mode)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Candidate: ${m.sha}\n\nManifest: ${hash}\n\nMobile: ${m.mode}, runtime ${m.runtimeVersion}\n\nWeb QA: ${m.config.staging.flatMap(t => t.urls).join(', ')}\n\nApprove these tested mobile and web artifacts together. Native releases require store preparation before approval.\n`,
    )
} else {
  invariant(process.argv[2] === 'execute', 'Unknown promotion command')
  const ota = new OTA()
  await ota.verify(m.ota, m.sha)
  await ota.verifyArtifacts(m.ota)
  for (const target of m.config.staging) await verifyWeb(target, m.web)
  await validate()
  if (m.mode === 'native')
    execFileSync('bundle', ['exec', 'fastlane', 'release_native'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        RELEASE_VERSION: m.runtimeVersion,
        IOS_BUILD_NUMBER: m.ios.buildNumber,
        ANDROID_VERSION_CODE: m.android.versionCode,
        TESTFLIGHT_GROUP: m.config.stores.publicTestFlightGroup || '',
      },
    })
  for (const target of m.config.production) await deployWeb(target, m.web)
  await validate()
  await ota.map('production', m.ota.branchId)
  await ota.verifyArtifacts(m.ota, 'production', true)
  await validate()
  if (m.mode === 'native') await gh.tag(`blacksky-v${m.runtimeVersion}`, m.sha)
  await gh.tag(releaseTag(m.branch), m.sha)
  await gh.request(
    `releases/${releaseId}`,
    {
      tag_name: releaseTag(m.branch),
      target_commitish: m.sha,
      name: `Release ${branchDate(m.branch)}`,
      draft: false,
      prerelease: false,
    },
    'PATCH',
  )
  await gh.request(`git/refs/heads/${m.branch}`, undefined, 'DELETE')
}
