import {type Client} from '@atproto/lex'
import {type I18n} from '@lingui/core'

import {compressVideo} from '#/lib/media/video/compress'
import {ServerError} from '#/lib/media/video/errors'
import {type VideoTelemetry} from '#/lib/media/video/telemetry'
import {uploadVideo} from '#/lib/media/video/upload'
import {processVideo, type VideoAction} from '../video'

jest.mock('#/lib/media/video/compress', () => ({compressVideo: jest.fn()}))
jest.mock('#/lib/media/video/upload', () => ({uploadVideo: jest.fn()}))
jest.mock('#/lib/media/video/util', () => ({
  createTokenlessVideoServiceClient: jest.fn(),
}))
jest.mock('#/logger', () => ({logger: {error: jest.fn(), debug: jest.fn()}}))

const i18n = {
  _: (descriptor: {message?: string}) => descriptor.message ?? '',
} as unknown as I18n

const telemetry = new Proxy(
  {},
  {get: () => () => {}},
) as unknown as VideoTelemetry

async function errorFor(e: unknown) {
  jest.mocked(compressVideo).mockResolvedValue({
    size: 1,
    mimeType: 'video/mp4',
  } as never)
  jest.mocked(uploadVideo).mockRejectedValue(e)
  const actions: VideoAction[] = []
  await processVideo(
    {} as never,
    action => actions.push(action),
    {assertDid: 'did:plc:me'} as unknown as Client,
    'https://video.example',
    new AbortController().signal,
    i18n,
    false,
    telemetry,
  )
  const failure = actions.find(action => action.type === 'to_error')
  return failure?.type === 'to_error' ? failure.error : undefined
}

describe('video upload errors', () => {
  it('translates a permission refusal from the single-request uploader', async () => {
    await expect(
      errorFor(new ServerError('User is not allowed to upload videos')),
    ).resolves.toBe('You are not allowed to upload videos.')
  })

  it('translates an unverified-email refusal', async () => {
    await expect(
      errorFor(new ServerError('Confirm your email address to upload videos')),
    ).resolves.toBe('Please confirm your email address to upload videos.')
  })
})
