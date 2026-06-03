const {withDangerousMod} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// React Native 0.81 compiles its pods at C++20. When React Native is built
// from source (buildReactNativeFromSource: true), the libc++ shipped with
// recent Xcode toolchains refuses to let a translation unit include both
// <atomic> and <stdatomic.h> below C++23, producing:
//   "<atomic> is incompatible with <stdatomic.h> before C++23"
//   "redefinition of '__c11_atomic_is_lock_free'"
// Bumping every pod target to C++23 resolves the conflict. C++23 is backward
// compatible with the C++20 the RN ecosystem targets, so this is additive.
const CXX_STANDARD = 'c++23'

const OVERRIDE_SNIPPET = `
    # Force C++23 for all pods. RN is built from source here and newer libc++
    # rejects mixing <atomic> and <stdatomic.h> below C++23. Runs after
    # react_native_post_install so this value wins over RN's C++20 default.
    installer.pods_project.targets.each do |cpp_std_target|
      cpp_std_target.build_configurations.each do |cpp_std_config|
        cpp_std_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = '${CXX_STANDARD}'
      end
    end`

// Pure transform, exported for verification. Injects the override inside the
// existing `post_install do |installer|` block, immediately after the
// react_native_post_install(...) call closes. Throws (rather than silently
// no-op) if the anchor is missing, so a Podfile template change fails loudly
// during prebuild instead of shipping an unpatched build.
function addCppLanguageStandard(contents) {
  if (contents.includes(`CLANG_CXX_LANGUAGE_STANDARD'] = '${CXX_STANDARD}'`)) {
    return contents
  }

  const lines = contents.split('\n')
  const startIdx = lines.findIndex(line =>
    line.includes('react_native_post_install('),
  )
  if (startIdx === -1) {
    throw new Error(
      '[withIosCppLanguageStandard] could not find react_native_post_install( in the Podfile; ' +
        'refusing to continue so the C++23 fix is not silently dropped',
    )
  }

  let closeIdx = -1
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim() === ')') {
      closeIdx = i
      break
    }
  }
  if (closeIdx === -1) {
    throw new Error(
      '[withIosCppLanguageStandard] could not find the end of the react_native_post_install( call',
    )
  }

  lines.splice(closeIdx + 1, 0, OVERRIDE_SNIPPET)
  return lines.join('\n')
}

module.exports = function withIosCppLanguageStandard(config) {
  return withDangerousMod(config, [
    'ios',
    async cfg => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile',
      )
      const contents = fs.readFileSync(podfilePath, 'utf8')
      fs.writeFileSync(podfilePath, addCppLanguageStandard(contents))
      return cfg
    },
  ])
}

module.exports.addCppLanguageStandard = addCppLanguageStandard
