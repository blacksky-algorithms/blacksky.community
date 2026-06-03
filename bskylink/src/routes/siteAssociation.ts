import {Express} from 'express'

import {AppContext} from '../context.js'

export default function (ctx: AppContext, app: Express) {
  return app.get('/.well-known/apple-app-site-association', (req, res) => {
    // TODO: Phase 0 — replace TEAMID placeholder with the real Apple
    // Developer Team ID once Phase 0.1 (Apple Developer enrollment) completes.
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: 'TEAMID.community.blacksky.app',
            paths: ['*'],
          },
        ],
      },
      appclips: {
        apps: ['TEAMID.community.blacksky.app.AppClip'],
      },
    })
  })
}
