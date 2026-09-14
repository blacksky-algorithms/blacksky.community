import {describe, expect, it} from '@jest/globals'

import {
  getGroupInviteCodeFromUrl,
  GROUP_INVITE_CODE_REGEX,
  isBskyGroupInviteUrl,
} from '../url-helpers'

const CODE = 'a'.repeat(43)

describe('group invite URLs', () => {
  it('accepts the exact client deep-link shape', () => {
    expect(GROUP_INVITE_CODE_REGEX.test(`/join/${CODE}`)).toBe(true)
    expect(
      getGroupInviteCodeFromUrl(`https://blacksky.community/join/${CODE}`),
    ).toBe(CODE)
    expect(isBskyGroupInviteUrl(`/join/${CODE}?from=message`)).toBe(true)
  })

  it.each([
    `/join/${'a'.repeat(42)}`,
    `/join/${'a'.repeat(44)}`,
    `/join/${'a'.repeat(42)}!`,
    `/join/${'a'.repeat(42)}%2F`,
    `/join/${'a'.repeat(43)}/extra`,
  ])('rejects malformed group invite URL %s', url => {
    expect(getGroupInviteCodeFromUrl(url)).toBeUndefined()
  })
})
