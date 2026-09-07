import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {json, required} from './core.mjs'

const directory = mkdtempSync(join(tmpdir(), 'release-qa-'))
try {
  const path = join(directory, 'key.json')
  writeFileSync(
    path,
    JSON.stringify({
      key_id: required('ASC_KEY_ID'),
      issuer_id: required('ASC_ISSUER_ID'),
      key: Buffer.from(required('ASC_KEY_P8_BASE64'), 'base64').toString(),
      in_house: false,
    }),
    {mode: 0o600},
  )
  const build = json('native-ios.json')
  execFileSync(
    'bundle',
    [
      'exec',
      'fastlane',
      'run',
      'upload_to_testflight',
      `api_key_path:${path}`,
      'distribute_only:true',
      'app_platform:ios',
      `app_identifier:${required('RELEASE_APP_IDENTIFIER')}`,
      `app_version:${build.version}`,
      `build_number:${build.buildNumber}`,
      `groups:${required('RELEASE_QA_TESTFLIGHT_GROUP')}`,
      'notify_external_testers:true',
    ],
    {stdio: 'inherit'},
  )
} finally {
  rmSync(directory, {recursive: true, force: true})
}
