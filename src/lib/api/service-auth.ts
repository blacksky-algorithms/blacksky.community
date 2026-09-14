import {type AtpAgent} from '@atproto/api'

import {getServiceAuthAudFromUrl} from '#/lib/strings/url-helpers'

export async function getServiceAuthToken({
  agent,
  aud,
  lxm,
  exp,
}: {
  agent: AtpAgent
  aud?: string
  lxm: string
  exp?: number
}) {
  const pdsAud = getServiceAuthAudFromUrl(agent.dispatchUrl)
  if (!pdsAud) {
    throw new Error('Agent does not have a PDS URL')
  }
  const {data: serviceAuth} = await agent.com.atproto.server.getServiceAuth({
    aud: aud ?? pdsAud,
    lxm,
    exp,
  })
  return serviceAuth.token
}
