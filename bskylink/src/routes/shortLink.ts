import assert from 'node:assert'

import {Express} from 'express'

import {AppContext} from '../context.js'
import {trackLinkEvent} from '../linkEvents.js'
import {handler} from './util.js'

export default function (ctx: AppContext, app: Express) {
  return app.get(
    '/:linkId',
    handler(async (req, res) => {
      const linkId = req.params.linkId
      const contentType = req.accepts(['html', 'json'])
      assert(
        typeof linkId === 'string',
        'express guarantees id parameter is a string',
      )
      const found = await ctx.db.db
        .selectFrom('link')
        .selectAll()
        .where('id', '=', linkId)
        .executeTakeFirst()
      if (!found) {
        // potentially broken or mistyped link
        res.setHeader('Cache-Control', 'no-store')
        if (contentType === 'json') {
          return res
            .status(404)
            .json({
              error: 'NotFound',
              message: 'Link not found',
            })
            .end()
        }
        // send the user to the app
        res.setHeader('Location', `https://${ctx.cfg.service.appHostname}`)
        return res.status(302).end()
      }
      // build url from original url in order to preserve query params
      const url = new URL(
        req.originalUrl,
        `https://${ctx.cfg.service.appHostname}`,
      )
      url.pathname = found.path
      ctx.metrics.track('shortlink', {linkId: found.id, path: found.path})
      await trackLinkEvent(ctx, {
        event: 'shortlink',
        link: url.href,
        host: url.hostname.toLowerCase(),
        linkId: found.id,
        referrer: req.get('referer'),
      })
      // Never cache: every visit must reach this service to be counted
      res.setHeader('Cache-Control', 'no-store')
      if (contentType === 'json') {
        return res.json({url: url.href}).end()
      }
      res.setHeader('Location', url.href)
      return res.status(302).end()
    }),
  )
}
