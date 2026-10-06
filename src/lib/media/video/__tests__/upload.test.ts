import {uploadVideo} from '../upload'

const mockCreateUploadTask = jest.fn()

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: {BINARY_CONTENT: 0},
  createUploadTask: mockCreateUploadTask,
}))
jest.mock('#/lib/api/service-auth', () => ({
  getServiceAuthToken: jest.fn().mockResolvedValue('token'),
}))
jest.mock('../upload.shared', () => ({
  getVideoUploadLimits: jest.fn().mockResolvedValue(undefined),
}))

describe('uploadVideo', () => {
  beforeEach(() => {
    mockCreateUploadTask.mockClear()
    mockCreateUploadTask.mockReturnValue({
      uploadAsync: jest.fn().mockResolvedValue({body: '{"jobId":"job"}'}),
    })
  })

  it.each([
    [true, 'true'],
    [false, null],
  ])(
    'sets private=%s only for private uploads',
    async (isPrivate, expected) => {
      await uploadVideo({
        video: {uri: 'file:///video.mp4', mimeType: 'video/mp4'} as never,
        agent: {} as never,
        did: 'did:plc:test',
        setProgress: jest.fn(),
        signal: new AbortController().signal,
        i18n: {_: (value: unknown) => value} as never,
        isPrivate,
      })

      const calls = mockCreateUploadTask.mock.calls as Array<
        [string, ...unknown[]]
      >
      const url = new URL(calls[0][0])
      expect(url.searchParams.get('private')).toBe(expected)
    },
  )
})
