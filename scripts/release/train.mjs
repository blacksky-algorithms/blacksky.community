import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {appendFileSync, renameSync, readFileSync} from 'node:fs'
import {GitHub} from './github.mjs'
import {
  allocateBuildNumber,
  digest,
  git,
  invariant,
  json,
  nextVersion,
  output,
  releaseBranch,
  required,
  nativeChanges,
  sha,
  compareVersions,
  validateManifest,
} from './core.mjs'
import {OTA} from './ota.mjs'
import {deployWeb, targets, separateTargets} from './web.mjs'

const gh = new GitHub()
const event = process.env.GITHUB_EVENT_PATH
  ? json(process.env.GITHUB_EVENT_PATH)
  : {}
const run = `${required('GITHUB_RUN_ID')}-${required('GITHUB_RUN_ATTEMPT')}`
const currentRun = `${process.env.GITHUB_SERVER_URL}/${gh.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`

async function activeBranches() {
  const branches = await gh.list('branches')
  const active = []
  for (const branch of branches.filter(b =>
    /^release\/\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(b.name),
  )) {
    if (
      !(await gh.succeeded('published', p => p.branch === branch.name)) &&
      !(await gh.succeeded('discarded', p => p.branch === branch.name))
    )
      active.push(branch.name)
  }
  invariant(
    active.length <= 1,
    'More than one unresolved release branch; resolve before continuing',
  )
  return active
}
async function baseline() {
  const published = await gh.succeeded('published', p => !!p.nativeBaseline)
  const value =
    published?.payload.nativeBaseline ||
    JSON.parse(required('RELEASE_NATIVE_BASELINE'))
  sha(value.sha)
  compareVersions(value.runtimeVersion, value.runtimeVersion)
  return value
}
async function schedule() {
  await gh.protectEnvironment()
  const active = await activeBranches()
  if (active.length) {
    output('skip', 'true')
    console.log(`Keeping unresolved candidate ${active[0]}`)
    return
  }
  const selected = sha(process.env.INPUT_SHA || (await gh.head('main')))
  const comparison = await gh.request(`compare/${selected}...main`)
  invariant(
    ['ahead', 'identical'].includes(comparison.status),
    'Selected SHA must belong to main',
  )
  await gh.checks(selected)
  const previous = await gh.succeeded('published', () => true)
  if (previous?.payload.sourceSha === selected) {
    output('skip', 'true')
    return
  }
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const branch = releaseBranch(
    `release/${date}-${process.env.GITHUB_RUN_NUMBER}`,
  )
  const base = await baseline()
  const native =
    nativeChanges(base.sha, selected) || process.env.INPUT_NATIVE === 'true'
  const pkg = (await gh.file('package.json', selected)).value
  const runtime = native
    ? nextVersion(pkg.version, base.runtimeVersion)
    : base.runtimeVersion
  const commit = await gh.commitFiles(
    selected,
    {
      '.release/train.json': {
        schema: 1,
        branch,
        sourceSha: selected,
        previousReleaseSha: previous?.payload.sha || base.sha,
        baseline: base,
        runtimeVersion: runtime,
        mode: native ? 'native' : 'ota',
      },
      'package.json': {...pkg, version: runtime},
    },
    `chore(release): cut QA train ${branch.slice(8)}`,
  )
  await gh.request('git/refs', {ref: `refs/heads/${branch}`, sha: commit.sha})
  await gh.request('releases', {
    tag_name: `qa-${branch.slice(8)}`,
    target_commitish: await gh.head(branch),
    name: `QA ${branch.slice(8)}`,
    body: `QA release branch: ${branch}\nSource: ${selected}`,
    draft: true,
    prerelease: true,
  })
  output('skip', 'true')
}
async function prepare() {
  await gh.protectEnvironment()
  const branch = releaseBranch(
    process.env.INPUT_BRANCH || process.env.GITHUB_REF_NAME,
  )
  invariant(
    (await activeBranches())[0] === branch,
    'Not the active release branch',
  )
  const head = sha(await gh.head(branch))
  if (process.env.GITHUB_EVENT_NAME === 'push')
    invariant(head === event.after, 'Superseded release push')
  const train = (await gh.file('.release/train.json', head)).value
  invariant(train.branch === branch, 'Train metadata does not match branch')
  const pkg = (await gh.file('package.json', head)).value
  const native = nativeChanges(train.baseline.sha, head)
  if (train.mode === 'ota' && native) {
    train.mode = 'native'
    train.runtimeVersion = nextVersion(
      pkg.version,
      train.baseline.runtimeVersion,
    )
    const commit = await gh.commitFiles(
      head,
      {
        '.release/train.json': train,
        'package.json': {...pkg, version: train.runtimeVersion},
      },
      `chore(release): require native runtime ${train.runtimeVersion}`,
    )
    await gh.request(
      `git/refs/heads/${branch}`,
      {sha: commit.sha, force: false},
      'PATCH',
    )
    console.log(
      'Native runtime recorded; the resulting branch push will prepare the replacement',
    )
    return
  }
  invariant(
    pkg.version === train.runtimeVersion,
    'Do not independently bump the candidate runtime',
  )
  const releases = await gh.list('releases')
  const release =
    releases.find(r => r.tag_name === `qa-${branch.slice(8)}` && r.draft) ||
    (await gh.request('releases', {
      tag_name: `qa-${branch.slice(8)}`,
      target_commitish: head,
      name: `QA ${branch.slice(8)}`,
      body: `QA release branch: ${branch}\nSource: ${train.sourceSha}`,
      draft: true,
      prerelease: true,
    }))
  output('sha', head)
  output('branch', branch)
  output('mode', train.mode)
  output('runtime', train.runtimeVersion)
  output('release_id', release.id)
  output('ota_branch', `rc-${head}-${run}`)
  output('attempt', required('GITHUB_RUN_ATTEMPT'))
  output(
    'build_number',
    allocateBuildNumber(
      required('RELEASE_BUILD_NUMBER_BASE'),
      required('GITHUB_RUN_NUMBER'),
      required('GITHUB_RUN_ATTEMPT'),
    ),
  )
  for (const workflow of ['lint.yml', 'golang-test-lint.yml'])
    await gh.dispatch(workflow, {}, branch)
  for (const pending of await gh.list(
    'actions/workflows/release-promote.yml/runs?status=waiting',
    'workflow_runs',
  )) {
    await gh.request(`actions/runs/${pending.id}/cancel`, {})
  }
}
async function finish() {
  const branch = releaseBranch(required('RELEASE_BRANCH'))
  const head = sha(required('CANDIDATE_SHA'))
  invariant(
    (await gh.head(branch)) === head,
    'Candidate superseded during build',
  )
  await gh.checks(head)
  invariant(
    (await activeBranches())[0] === branch,
    'Not the active release branch',
  )
  const train = (await gh.file('.release/train.json', head)).value
  const release = await gh.request(`releases/${required('RELEASE_ID')}`)
  const web = {
    repository: required('RELEASE_IMAGE_REPOSITORY'),
    digest: required('WEB_DIGEST'),
    sha: head,
    version: train.runtimeVersion,
  }
  const config = {
    staging: targets('RELEASE_STAGING_TARGETS'),
    production: targets('RELEASE_PRODUCTION_TARGETS'),
    otaUrl: required('RELEASE_OTA_URL'),
    iosDestination: required('RELEASE_IOS_DESTINATION'),
    stores: {
      appId: required('ASC_APP_ID'),
      appIdentifier: required('RELEASE_APP_IDENTIFIER'),
      publicTestFlightGroup:
        process.env.RELEASE_PUBLIC_TESTFLIGHT_GROUP || null,
    },
  }
  separateTargets(config.staging, config.production)
  invariant(
    ['app-store', 'testflight'].includes(config.iosDestination),
    'Invalid iOS destination',
  )
  invariant(
    config.iosDestination !== 'testflight' ||
      config.stores.publicTestFlightGroup,
    'Public TestFlight group required',
  )
  const m = {
    schema: 1,
    branch,
    sha: head,
    sourceSha: train.sourceSha,
    runtimeVersion: train.runtimeVersion,
    mode: train.mode,
    nativeBaseline: train.baseline,
    run: currentRun,
    web,
    config,
  }
  const ota = new OTA()
  m.ota = await ota.snapshot(required('OTA_BRANCH'), m.runtimeVersion, head)
  if (m.mode === 'native') {
    m.ios = json('native-ios.json')
    m.android = json('native-android.json')
  }
  if (m.mode === 'native') {
    for (const [platform, extension] of [
      ['ios', 'ipa'],
      ['android', 'aab'],
    ]) {
      invariant(
        createHash('sha256')
          .update(readFileSync(`candidate.${extension}`))
          .digest('hex') === m[platform].checksum,
        'Native artifact bytes differ from recorded checksum',
      )
      const filename = `native-${platform}-${head}-${run}.${extension}`
      renameSync(`candidate.${extension}`, filename)
      execFileSync(
        'gh',
        ['release', 'upload', release.tag_name, filename, '--repo', gh.repo],
        {stdio: 'inherit'},
      )
      m[platform].assetName = filename
    }
  }
  const compare = await gh.request(
    `compare/${train.previousReleaseSha || train.baseline.sha}...${head}`,
  )
  const notes = compare.commits
    .filter(c => !c.commit.message.startsWith('chore(release):'))
    .map(c => `- ${c.commit.message.split('\n')[0]}`)
    .join('\n')
  m.releaseNotes = notes || 'Maintenance release.'
  validateManifest(m, false)
  for (const target of config.staging) await deployWeb(target, web)
  invariant(
    (await gh.head(branch)) === head,
    'Release branch changed during QA deployment',
  )
  await ota.map('release-qa', m.ota.branchId)
  m.ota.artifacts = await ota.artifacts(m.ota)
  validateManifest(m)
  const assetName = `candidate-${head}-${run}.json`
  await gh.upload(release, assetName, m)
  const body = `Candidate: ${head}\nRuntime: ${m.runtimeVersion}; lane: ${m.mode}\nManifest SHA-256: ${digest(m)}\n\n${notes}\n\nQA:\n- Sign in and restore an existing session.\n- Read feeds, open profiles, create and interact with posts.\n- Exercise changed behavior on iOS, Android, and web.\n- Verify Settings commit matches this candidate.\n\nStaging: ${config.staging.flatMap(t => t.urls).join(', ')}\nMobile: release-qa OTA or QA store builds.\nRun: ${currentRun}`
  await gh.request(`releases/${release.id}`, {body}, 'PATCH')
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n')
  await gh.event(
    {...m, manifestHash: digest(m), assetName, releaseId: release.id},
    'qa',
    'success',
  )
  await gh.dispatch('release-promote.yml', {
    release_id: String(release.id),
    asset: assetName,
    manifest_hash: digest(m),
    operation: 'release',
  })
}
async function forwardportOne(pr) {
  invariant(
    pr?.merged && pr.base.repo.full_name === gh.repo,
    'Expected merged repository PR',
  )
  const branch = releaseBranch(pr.base.ref)
  const merge = sha(pr.merge_commit_sha)
  const commit = await gh.request(`commits/${merge}`)
  invariant(
    commit.parents.length === 1,
    'QA fix PRs must use squash merge; manually forward-port this PR',
  )
  const fixFiles = await gh.list(`pulls/${pr.number}/files`)
  invariant(
    !fixFiles.some(f => f.filename === '.release/train.json'),
    'Train metadata is not a QA fix',
  )
  const forwardBranch = `forwardport/qa-${pr.number}-${merge.slice(0, 12)}`
  const existing = await gh.list(
    `pulls?state=all&head=${gh.repo.split('/')[0]}:${forwardBranch}`,
  )
  if (existing.length) {
    console.log(`Forward-port already recorded: ${existing[0].html_url}`)
    return
  }
  let remote
  try {
    remote = await gh.head(forwardBranch)
  } catch (error) {
    if (error.status !== 404) throw error
  }
  if (remote) {
    const existingCommit = await gh.request(`commits/${remote}`)
    invariant(
      existingCommit.commit.message.includes(
        `(cherry picked from commit ${merge})`,
      ),
      'Forward-port branch exists with a different patch',
    )
    const created = await gh.request('pulls', {
      base: 'main',
      head: forwardBranch,
      title: `fix: forward-port #${pr.number}`,
      body: `Forward-ports #${pr.number}. Original fix: ${merge}. Requires normal CI and review.`,
    })
    console.log(created.html_url)
    return
  }
  git('fetch', 'origin', 'main', branch)
  git('checkout', '-B', forwardBranch, 'origin/main')
  git('config', 'user.name', 'github-actions[bot]')
  git(
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  )
  try {
    git('cherry-pick', '-x', merge)
  } catch {
    const files = git('diff', '--name-only', '--diff-filter=U')
    git('cherry-pick', '--abort')
    await gh.event(
      {sha: merge, branch, pr: pr.number, files},
      'forwardport-conflict',
      'failure',
      'Resolve forward-port conflict manually',
    )
    throw new Error(
      `Forward-port #${pr.number} conflicts: ${files}. Apply this fix to main before later dependent fixes.`,
    )
  }
  execFileSync('git', ['push', 'origin', `HEAD:refs/heads/${forwardBranch}`], {
    stdio: 'inherit',
  })
  const created = await gh.request('pulls', {
    base: 'main',
    head: forwardBranch,
    title: `fix: forward-port #${pr.number}`,
    body: `Forward-ports #${pr.number} from \`${branch}\`.\n\nOriginal fix: ${merge}\n\nRequires normal CI and review.`,
  })
  console.log(created.html_url)
}
async function forwardport() {
  const branch = releaseBranch(required('GITHUB_REF_NAME'))
  const prs = await gh.list(
    `pulls?state=closed&base=${encodeURIComponent(branch)}`,
  )
  for (const pr of prs
    .filter(p => p.merged_at)
    .sort((a, b) => a.merged_at.localeCompare(b.merged_at))) {
    await forwardportOne(await gh.request(`pulls/${pr.number}`))
  }
}

const operation = process.argv[2]
if (operation === 'schedule') await schedule()
else if (operation === 'prepare') await prepare()
else if (operation === 'finish') await finish()
else if (operation === 'forwardport') await forwardport()
else if (operation === 'checks') await gh.checks(sha(required('CANDIDATE_SHA')))
else throw new Error('Unknown train operation')
