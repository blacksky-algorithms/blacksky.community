import {invariant, required} from './core.mjs'

export class OTA {
  constructor() {
    this.base = new URL(required('RELEASE_OTA_URL')).origin
    invariant(this.base.startsWith('https://'), 'OTA URL must use HTTPS')
  }
  async request(path, body) {
    const response = await fetch(`${this.base}/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${required('EXPO_TOKEN')}`,
        'use-expo-auth': 'true',
        'content-type': 'application/json',
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(60000),
    })
    invariant(
      response.ok,
      `OTA API ${path.split('/')[0]}: HTTP ${response.status}`,
    )
    return response.json()
  }
  async channel(name) {
    const channels = await this.request('channels')
    return invariant(
      channels.find(c => c.releaseChannelName === name),
      `Create OTA channel ${name} before activation`,
    )
  }
  async snapshot(branch, runtime, commit) {
    const branches = await this.request('branches')
    const source = invariant(
      branches.find(b => b.branchName === branch && b.branchId),
      'OTA candidate branch missing',
    )
    const prefix = `branch/${encodeURIComponent(branch)}/runtimeVersion/${encodeURIComponent(runtime)}/updates`
    const updates = await this.request(prefix)
    const identities = {}
    for (const platform of ['ios', 'android']) {
      const matching = updates
        .filter(u => u.platform === platform && u.commitHash === commit)
        .sort((a, b) =>
          String(b.updateId).localeCompare(String(a.updateId), undefined, {
            numeric: true,
          }),
        )
      const update = invariant(
        matching[0],
        `Missing exact ${platform} OTA commit`,
      )
      identities[platform] = {
        updateId: update.updateId,
        updateUUID: update.updateUUID,
        commitHash: update.commitHash,
      }
    }
    return {
      branch,
      branchId: source.branchId,
      runtimeVersion: runtime,
      updates: identities,
    }
  }
  async map(channelName, branchId) {
    const channel = await this.channel(channelName)
    if (channel.branchId === branchId) return
    await this.request(
      `branch/${encodeURIComponent(branchId)}/updateChannelBranchMapping`,
      {releaseChannel: channel.releaseChannelId},
    )
  }
}
