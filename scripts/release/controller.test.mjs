import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync, spawn} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {createServer} from 'node:http'
import {digest, nativeChanges} from './core.mjs'

const root = resolve(import.meta.dirname, '../..')
const sha = 'a'.repeat(40)
const target = {
  kind: 'app',
  name: 'web',
  appId: 'app',
  component: 'web',
  urls: ['https://web.example'],
}
const m = {
  schema: 1,
  branch: 'release/2026-09-14-10',
  sha,
  sourceSha: sha,
  mode: 'ota',
  runtimeVersion: '1.0.0',
  web: {
    sha,
    version: '1.0.0',
    repository: 'registry.digitalocean.com/test/web',
    digest: `sha256:${'b'.repeat(64)}`,
  },
  ota: {
    runtimeVersion: '1.0.0',
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
      ios: {commitHash: sha, updateId: '1'},
      android: {commitHash: sha, updateId: '2'},
    },
  },
  config: {
    production: [target],
    staging: [{...target, urls: ['https://staging.example']}],
    otaUrl: 'https://ota.example',
    iosDestination: 'app-store',
    stores: {
      appId: '123',
      appIdentifier: 'community.test',
      publicTestFlightGroup: null,
    },
  },
}
async function server(t, handler) {
  const requests = []
  const errors = []
  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://example')
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined
      requests.push({url, method: req.method, body})
      const response = await handler(url, req.method, body)
      if (response instanceof Response) {
        res.writeHead(response.status, {'content-type': 'application/json'})
        res.end(await response.text())
        return
      }
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify(response))
    } catch (error) {
      errors.push(error)
      res.writeHead(500)
      res.end('{}')
    }
  })
  await new Promise(r => http.listen(0, '127.0.0.1', r))
  t.after(() => {
    http.closeAllConnections()
    http.close()
    assert.deepEqual(errors, [])
  })
  return {base: `http://127.0.0.1:${http.address().port}`, requests}
}
async function cli(file, operation, base, extra = {}) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [`${root}/scripts/release/${file}.mjs`, operation],
      {
        cwd: root,
        env: {
          ...process.env,
          GITHUB_API_URL: base,
          GITHUB_REPOSITORY: 'owner/repo',
          GH_TOKEN: 'test-only',
          GITHUB_RUN_ID: '100',
          GITHUB_RUN_NUMBER: '10',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_SERVER_URL: 'https://github.com',
          RELEASE_REQUIRED_CHECKS: '["tests"]',
          RELEASE_OPERATION: 'release',
          RELEASE_ID: '12',
          CANDIDATE_ASSET: 'candidate.json',
          MANIFEST_HASH: digest(m),
          RELEASE_PRODUCTION_TARGETS: JSON.stringify([target]),
          RELEASE_OTA_URL: 'https://ota.example',
          RELEASE_IOS_DESTINATION: 'app-store',
          ASC_APP_ID: '123',
          RELEASE_APP_IDENTIFIER: 'community.test',
          ...extra,
        },
      },
    )
    let text = ''
    child.stdout.on('data', d => {
      text += d
    })
    child.stderr.on('data', d => {
      text += d
    })
    child.on('close', code => resolve({code, text}))
  })
}
test('schedule retains unresolved release without selecting main or writing refs', async t => {
  const api = await server(t, url => {
    if (url.pathname.endsWith('/environments/production'))
      return {protection_rules: [{type: 'required_reviewers', reviewers: [{}]}]}
    if (url.pathname.endsWith('/branches')) return [{name: m.branch}]
    if (url.pathname.endsWith('/deployments')) return []
    throw new Error(`Unexpected request ${url}`)
  })
  const result = await cli('train', 'schedule', api.base)
  assert.equal(result.code, 0, result.text)
  assert.match(result.text, /Keeping unresolved/)
  assert.equal(
    api.requests.some(r => r.method !== 'GET'),
    false,
  )
})
test('failed main CI stops a cut without falling back or creating a branch', async t => {
  const api = await server(t, url => {
    if (url.pathname.endsWith('/environments/production'))
      return {protection_rules: [{type: 'required_reviewers', reviewers: [{}]}]}
    if (url.pathname.endsWith('/branches')) return []
    if (url.pathname.endsWith('/git/ref/heads/main')) return {object: {sha}}
    if (url.pathname.includes('/compare/')) return {status: 'identical'}
    if (url.pathname.endsWith('/check-runs'))
      return {
        check_runs: [
          {
            id: 1,
            name: 'tests',
            status: 'completed',
            conclusion: 'failure',
            app: {slug: 'github-actions'},
          },
        ],
      }
    throw new Error(`Unexpected request ${url}`)
  })
  const result = await cli('train', 'schedule', api.base)
  assert.notEqual(result.code, 0)
  assert.match(result.text, /Required CI failed/)
  assert.equal(
    api.requests.some(r => r.method !== 'GET'),
    false,
  )
})
test('same SHA with newer QA artifacts invalidates older approval before execution', async t => {
  let base
  const api = await server(t, url => {
    if (url.pathname.endsWith('/releases/12/assets'))
      return [{name: 'candidate.json', url: `${base}/candidate`}]
    if (url.pathname === '/candidate') return m
    if (url.pathname.endsWith('/environments/production'))
      return {protection_rules: [{type: 'required_reviewers', reviewers: [{}]}]}
    if (url.pathname.includes('/git/ref/heads/')) return {object: {sha}}
    if (url.pathname.endsWith('/deployments'))
      return url.searchParams.get('task') === 'qa'
        ? [
            {
              id: 1,
              payload: {
                sha,
                branch: m.branch,
                manifestHash: 'newer-manifest',
                releaseId: '12',
                assetName: 'newer.json',
              },
            },
          ]
        : []
    if (url.pathname.endsWith('/statuses')) return [{state: 'success'}]
    throw new Error(`Unexpected request ${url}`)
  })
  base = api.base
  const result = await cli('promote', 'preflight', base)
  assert.notEqual(result.code, 0)
  assert.match(result.text, /newer candidate/)
  assert.equal(
    api.requests.some(r => r.method !== 'GET'),
    false,
  )
})
test('release-only package version bump does not force the next JS train to rebuild natively', t => {
  const directory = mkdtempSync(join(tmpdir(), 'release-native-diff-'))
  const cwd = process.cwd()
  t.after(() => {
    process.chdir(cwd)
    rmSync(directory, {recursive: true, force: true})
  })
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.invalid')
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({version: '1.0.0', dependencies: {expo: '1'}}),
  )
  git('add', '.')
  git('commit', '-m', 'initial')
  const main = git('rev-parse', 'HEAD')
  git('checkout', '-b', 'release')
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({version: '1.0.1', dependencies: {expo: '1'}}),
  )
  git('commit', '-am', 'native version')
  const native = git('rev-parse', 'HEAD')
  process.chdir(directory)
  assert.equal(nativeChanges(native, main), false)
  git('checkout', 'main')
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({version: '1.0.0', dependencies: {expo: '2'}}),
  )
  git('commit', '-am', 'upgrade native dependency')
  assert.equal(nativeChanges(native, git('rev-parse', 'HEAD')), true)
})

test('release cut writes runtime and train together before exposing the branch', async t => {
  const selected = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const nativeBaseline = {sha: selected, runtimeVersion: '1.0.0'}
  const api = await server(t, (url, method, body) => {
    const path = url.pathname
    if (path.endsWith('/environments/production'))
      return {protection_rules: [{type: 'required_reviewers', reviewers: [{}]}]}
    if (path.endsWith('/branches') || path.endsWith('/deployments')) return []
    if (path.includes('/compare/')) return {status: 'identical'}
    if (path.endsWith('/check-runs'))
      return {
        check_runs: [
          {
            id: 1,
            name: 'tests',
            status: 'completed',
            conclusion: 'success',
            app: {slug: 'github-actions'},
          },
        ],
      }
    if (path.endsWith('/contents/package.json'))
      return {
        sha: 'blob',
        content: Buffer.from(JSON.stringify({version: '0.9.0'})).toString(
          'base64',
        ),
      }
    if (path.endsWith(`/git/commits/${selected}`))
      return {tree: {sha: 'base-tree'}}
    if (path.endsWith('/git/trees')) {
      assert.deepEqual(
        body.tree.map(f => f.path),
        ['.release/train.json', 'package.json'],
      )
      assert.equal(JSON.parse(body.tree[1].content).version, '1.0.0')
      return {sha: 'tree'}
    }
    if (path.endsWith('/git/commits')) return {sha}
    if (path.endsWith('/git/refs')) {
      assert.equal(body.sha, sha)
      return {object: {sha}}
    }
    if (path.includes('/git/ref/heads/release/')) return {object: {sha}}
    if (path.endsWith('/releases')) return {id: 12}
    if (path.endsWith('/dispatches')) return {}
    throw new Error(`Unexpected request ${url}`)
  })
  const result = await cli('train', 'schedule', api.base, {
    INPUT_SHA: selected,
    RELEASE_NATIVE_BASELINE: JSON.stringify(nativeBaseline),
  })
  assert.equal(result.code, 0, result.text)
  const writes = api.requests
    .filter(r => r.method !== 'GET')
    .map(r => r.url.pathname.split('/').at(-1))
  assert.deepEqual(writes, ['trees', 'commits', 'refs', 'releases'])
})

test('forward-port retries reuse the pushed patch after PR creation fails', async t => {
  const merge = 'b'.repeat(40)
  const remote = 'c'.repeat(40)
  let attempts = 0
  const api = await server(t, (url, method) => {
    const path = url.pathname
    if (path.endsWith('/pulls') && method === 'POST') {
      attempts++
      return attempts === 1
        ? new Response('{}', {status: 503})
        : {html_url: 'https://github.com/owner/repo/pull/2'}
    }
    if (path.endsWith('/pulls'))
      return url.searchParams.has('head')
        ? []
        : [{number: 1, merged_at: '2026-09-14T14:00:00Z'}]
    if (path.endsWith('/pulls/1'))
      return {
        number: 1,
        merged: true,
        merge_commit_sha: merge,
        base: {ref: m.branch, repo: {full_name: 'owner/repo'}},
      }
    if (path.endsWith(`/commits/${merge}`)) return {parents: [{sha}]}
    if (path.endsWith('/files')) return [{filename: 'src/fix.ts'}]
    if (path.includes('/git/ref/heads/forwardport/'))
      return {object: {sha: remote}}
    if (path.endsWith(`/commits/${remote}`))
      return {commit: {message: `Fix\n\n(cherry picked from commit ${merge})`}}
    throw new Error(`Unexpected request ${url}`)
  })
  const env = {GITHUB_REF_NAME: m.branch}
  const first = await cli('train', 'forwardport', api.base, env)
  assert.notEqual(first.code, 0)
  const retry = await cli('train', 'forwardport', api.base, env)
  assert.equal(retry.code, 0, retry.text)
  assert.equal(attempts, 2)
  assert.equal(api.requests.filter(r => r.method !== 'GET').length, 2)
})
