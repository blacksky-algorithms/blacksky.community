import {required, invariant, chooseChecks} from './core.mjs'

export class GitHub {
  constructor(
    token = required('GH_TOKEN'),
    repo = required('GITHUB_REPOSITORY'),
  ) {
    this.token = token
    this.repo = repo
    this.base = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}`
  }
  async request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const url = path.startsWith('https://') ? path : `${this.base}/${path}`
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok) {
      const error = new Error(
        `GitHub ${method} ${path.split('?')[0]}: HTTP ${response.status}`,
      )
      error.status = response.status
      throw error
    }
    return response.status === 204 ? null : response.json()
  }
  async list(path, key) {
    const rows = []
    for (let page = 1; ; page++) {
      const result = await this.request(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
      )
      const batch = key ? result[key] : result
      rows.push(...batch)
      if (batch.length < 100) return rows
    }
  }
  async head(branch) {
    return (await this.request(`git/ref/heads/${branch}`)).object.sha
  }
  async file(path, ref) {
    const response = await this.request(
      `contents/${path}?ref=${encodeURIComponent(ref)}`,
    )
    return {
      blob: response.sha,
      value: JSON.parse(Buffer.from(response.content, 'base64').toString()),
    }
  }
  async tag(name, commit) {
    try {
      await this.request('git/refs', {ref: `refs/tags/${name}`, sha: commit})
    } catch (error) {
      if (error.status !== 422) throw error
      invariant(
        (await this.request(`git/ref/tags/${name}`)).object.sha === commit,
        'Release tag points to a different commit',
      )
    }
  }
  async commitFiles(parent, files, message) {
    const commit = await this.request(`git/commits/${parent}`)
    const tree = await this.request('git/trees', {
      base_tree: commit.tree.sha,
      tree: Object.entries(files).map(([path, value]) => ({
        path,
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(value, null, 2) + '\n',
      })),
    })
    return this.request('git/commits', {
      message,
      tree: tree.sha,
      parents: [parent],
    })
  }
  async checks(commit) {
    const names = JSON.parse(required('RELEASE_REQUIRED_CHECKS'))
    invariant(
      Array.isArray(names) &&
        names.length > 0 &&
        names.every(n => typeof n === 'string'),
      'Configure required check names',
    )
    const statuses = chooseChecks(
      await this.list(`commits/${commit}/check-runs`, 'check_runs'),
      names,
    )
    invariant(
      statuses.every(s => s === 'success'),
      'Selected main SHA must have passing required CI; no older fallback',
    )
  }

  async dispatch(workflow, inputs = {}, ref = 'main') {
    return this.request(`actions/workflows/${workflow}/dispatches`, {
      ref,
      inputs,
    })
  }
  async protectEnvironment() {
    const env = await this.request('environments/production')
    invariant(
      env.protection_rules?.some(
        r => r.type === 'required_reviewers' && r.reviewers?.length,
      ),
      'production environment must have required reviewers before enabling releases',
    )
  }
  async upload(release, name, data) {
    invariant(
      !release.assets?.some(a => a.name === name),
      `Immutable asset already exists: ${name}`,
    )
    const response = await fetch(
      `${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data, null, 2) + '\n',
        signal: AbortSignal.timeout(60000),
      },
    )
    invariant(response.ok, `Asset upload failed: HTTP ${response.status}`)
    return response.json()
  }
  async asset(releaseId, name) {
    const assets = await this.list(`releases/${releaseId}/assets`)
    const asset = invariant(
      assets.find(a => a.name === name),
      'Candidate asset not found',
    )
    const response = await fetch(asset.url, {
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/octet-stream',
      },
      signal: AbortSignal.timeout(60000),
    })
    invariant(response.ok, 'Cannot download candidate asset')
    return response.json()
  }
}
