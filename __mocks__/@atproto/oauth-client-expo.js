// The package picks its implementation by platform file suffix, which only
// Metro resolves. Tests that drive OAuth install their own client.
module.exports = {
  ...jest.requireActual('@atproto/oauth-client'),
  ExpoOAuthClient: class {
    restore() {
      return Promise.reject(new Error('No OAuth client under test'))
    }
  },
}
