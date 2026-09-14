import {type AtpAgent} from '@atproto/api'
import {type I18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'

import {getServiceAuthToken} from '#/lib/api/service-auth'
import {VIDEO_SERVICE_DID} from '#/lib/constants'
import {UploadLimitError} from '#/lib/media/video/errors'
import {createVideoAgent} from './util'

export async function getVideoUploadLimits(agent: AtpAgent, i18n: I18n) {
  const token = await getServiceAuthToken({
    agent,
    lxm: 'app.bsky.video.getUploadLimits',
    aud: VIDEO_SERVICE_DID,
  })
  const videoAgent = createVideoAgent()
  const {data: limits} = await videoAgent.app.bsky.video
    .getUploadLimits({}, {headers: {Authorization: `Bearer ${token}`}})
    .catch(err => {
      if (err instanceof Error) {
        throw new UploadLimitError(err.message)
      } else {
        throw err
      }
    })

  if (!limits.canUpload) {
    if (limits.message) {
      throw new UploadLimitError(limits.message)
    } else {
      throw new UploadLimitError(
        i18n._(
          msg`You have temporarily reached the limit for video uploads. Please try again later.`,
        ),
      )
    }
  }
}
