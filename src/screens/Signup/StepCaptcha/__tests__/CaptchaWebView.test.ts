import {buildAllowedHosts} from '#/screens/Signup/StepCaptcha/CaptchaWebView'

describe('buildAllowedHosts', () => {
  it('allows the community PDS the signup is pointed at', () => {
    expect(buildAllowedHosts('https://medsky.network')).toContain(
      'medsky.network',
    )
  })

  it('keeps the static hosts alongside the community PDS', () => {
    const hosts = buildAllowedHosts('https://medsky.network')
    expect(hosts).toEqual(expect.arrayContaining(['blacksky.app', 'bsky.app']))
  })

  it('strips the port and path from the service URL', () => {
    expect(buildAllowedHosts('https://pds.example.com/xrpc')).toContain(
      'pds.example.com',
    )
  })

  it('does not duplicate a host already on the static list', () => {
    const hosts = buildAllowedHosts('https://blacksky.app')
    expect(hosts.filter(h => h === 'blacksky.app')).toHaveLength(1)
  })

  it('falls back to the static list when serviceUrl is unset', () => {
    expect(buildAllowedHosts(undefined)).toContain('blacksky.app')
    expect(buildAllowedHosts(undefined)).not.toContain('medsky.network')
  })

  it('falls back to the static list when serviceUrl is malformed', () => {
    const hosts = buildAllowedHosts('not a url')
    expect(hosts).toContain('blacksky.app')
    expect(hosts).toHaveLength(buildAllowedHosts(undefined).length)
  })
})
