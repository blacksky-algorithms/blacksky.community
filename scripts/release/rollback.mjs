import {invariant} from './core.mjs'
import {snapshotWeb, deployWeb} from './web.mjs'

export async function rollbackRelease(ota, candidate, rollback, adapters = {}) {
  const snapshot = adapters.snapshotWeb || snapshotWeb
  const deploy = adapters.deployWeb || deployWeb
  const channel = await ota.channel('production')
  invariant(
    [candidate.ota.branchId, rollback.ota.branchId].includes(channel.branchId),
    'Production OTA moved to an unrelated release',
  )
  await ota.verify(rollback.ota, rollback.web[0].web.sha)
  await ota.hashAssets(
    Object.values(rollback.ota.artifacts).flatMap(p => p.assets),
  )
  for (const {target, web} of rollback.web) {
    const state = await snapshot(target)
    const image = state.image
    invariant(
      [
        `${web.repository}@${web.digest}`,
        `${candidate.web.repository}@${candidate.web.digest}`,
      ].includes(image),
      'Production web moved to an unrelated release',
    )
  }
  for (const {target, web} of rollback.web) await deploy(target, web)
  await ota.map('production', rollback.ota.branchId)
  await ota.verifyArtifacts(rollback.ota, 'production')
}
