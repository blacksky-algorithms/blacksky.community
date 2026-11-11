/** @type {import('@expo/fingerprint').Config} */
const config = {
  /*
   * Expo 58 changed the default to 'balanced', which hashes autolinked native
   * modules and config plugins by their package.json version and ignores
   * eas.json and app version changes. Stick with the historical 'strict'
   * behaviour so any change to native sources changes the fingerprint.
   */
  preset: 'strict',
  /*
   * The worklets Babel plugin writes generated JS into this directory whenever
   * Metro bundles, which would otherwise change the fingerprint of any checkout
   * that has run Metro and make EAS build cache lookups miss. Only `*.js` is
   * ignored so the shipped `dummy.md` keeps clean-install hashes unchanged.
   */
  ignorePaths: [
    '**/node_modules/react-native-worklets/.worklets/*.js',
    /*
     * app.config.js loads the share platform catalog, which would make every
     * catalog edit look native. The only native parts, its iOS schemes and
     * Android packages, are already hashed as part of the resolved Expo config,
     * so ignoring the file still catches the changes that need a native build.
     */
    'src/components/ShareDialog/catalog.ts',
  ],
}

module.exports = config
