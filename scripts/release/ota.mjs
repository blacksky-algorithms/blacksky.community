import {createHash} from 'node:crypto'
import {digest, invariant, required, sleep} from './core.mjs'

const mappingPending = message =>
  Object.assign(new Error(message), {code: 'OTA_MAPPING_PENDING'})

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
    invariant(
      updates.length === 2,
      'Candidate OTA branch must contain exactly one update per platform',
    )
    const identities = {}
    for (const platform of ['ios', 'android']) {
      const matching = updates.filter(
        u => u.platform === platform && u.commitHash === commit,
      )
      invariant(matching.length === 1, `Missing exact ${platform} OTA commit`)
      const update = matching[0]
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
  async verify(snapshot, commit) {
    const actual = await this.snapshot(
      snapshot.branch,
      snapshot.runtimeVersion,
      commit,
    )
    invariant(
      digest(actual) ===
        digest(
          Object.fromEntries(
            Object.entries(snapshot).filter(([key]) => key !== 'artifacts'),
          ),
        ),
      'OTA candidate changed after QA',
    )
  }
  async hashAssets(assets) {
    const records = []
    for (const asset of assets) {
      invariant(
        new URL(asset.url).origin === this.base,
        'Unexpected OTA asset origin',
      )
      const response = await fetch(asset.url, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(120000),
      })
      invariant(response.ok && response.body, 'OTA asset unavailable')
      const hash = createHash('sha256')
      let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        invariant(
          size <= 256 * 1024 * 1024,
          'OTA asset exceeds verification limit',
        )
        hash.update(chunk)
      }
      const actual = hash.digest('base64url')
      invariant(
        actual === asset.hash,
        'OTA asset bytes differ from the tested hash',
      )
      records.push({url: asset.url, hash: actual})
    }
    return records
  }
  async artifacts(snapshot, channel = 'release-qa') {
    if ((await this.channel(channel)).branchId !== snapshot.branchId)
      throw mappingPending('Channel no longer selects this candidate')
    const artifacts = {}
    for (const platform of ['ios', 'android']) {
      const response = await fetch(`${this.base}/manifest`, {
        headers: {
          'expo-channel-name': channel,
          'expo-runtime-version': snapshot.runtimeVersion,
          'expo-platform': platform,
          'expo-protocol-version': '1',
        },
        signal: AbortSignal.timeout(60000),
      })
      invariant(response.ok, 'OTA manifest unavailable')
      const boundary = /boundary="?([^";]+)"?/.exec(
        response.headers.get('content-type') || '',
      )?.[1]
      invariant(boundary, 'Expected multipart OTA manifest')
      const parts = (await response.text()).split(`--${boundary}`)
      const part = parts.find(p => /name="manifest"/.test(p))
      const parsePart = value =>
        JSON.parse(value.slice(value.indexOf('\r\n\r\n') + 4).trim())
      if (!part) {
        const directive = parts.find(p => /name="directive"/.test(p))
        if (directive && parsePart(directive).type === 'noUpdateAvailable')
          throw mappingPending('Candidate update not served yet')
      }
      invariant(
        part,
        'Expected update, received no-update or rollback directive',
      )
      const manifest = parsePart(part)
      if (
        manifest.id !== snapshot.updates[platform].updateUUID ||
        manifest.runtimeVersion !== snapshot.runtimeVersion
      )
        throw mappingPending('OTA manifest identity mismatch')
      artifacts[platform] = {
        manifestHash: digest(manifest),
        assets: await this.hashAssets([
          manifest.launchAsset,
          ...manifest.assets,
        ]),
      }
    }
    return artifacts
  }
  async waitForArtifacts(snapshot, channel = 'release-qa') {
    const deadline = Date.now() + 90000
    for (;;) {
      try {
        return await this.artifacts(snapshot, channel)
      } catch (error) {
        if (error.code !== 'OTA_MAPPING_PENDING' || Date.now() >= deadline)
          throw error
        await sleep(5000)
      }
    }
  }
  async verifyArtifacts(
    snapshot,
    channel = 'release-qa',
    waitForMapping = false,
  ) {
    for (const platform of ['ios', 'android']) {
      invariant(
        snapshot.artifacts?.[platform]?.assets?.length,
        'Missing tested OTA asset hashes',
      )
    }
    const current = waitForMapping
      ? await this.waitForArtifacts(snapshot, channel)
      : await this.artifacts(snapshot, channel)
    invariant(
      digest(current) === digest(snapshot.artifacts),
      'OTA manifest changed after QA',
    )
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
