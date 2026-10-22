import resvg from '@resvg/resvg-js'
import {type Express} from 'express'
import satori from 'satori'

import {
  EVENT_HEIGHT,
  EVENT_WIDTH,
  EventCard,
  toEventCardData,
} from '../components/Event.js'
import {type AppContext} from '../context.js'
import {httpLogger} from '../logger.js'
import {loadEmojiAsSvg} from '../util.js'
import {getImage, handler, originVerifyMiddleware} from './util.js'

type EventView = {
  record: unknown
  thumb?: string
  creator: {did: string; handle: string; displayName?: string}
}

const DID_RE = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/
const RKEY_RE = /^[a-zA-Z0-9._:~-]{1,512}$/

// satori can't decode WebP, and a failed decode would fail the whole card.
const isJpegOrPng = (buf: Buffer) =>
  (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50)

export default function (ctx: AppContext, app: Express) {
  return app.get(
    '/event/:did/:rkey',
    originVerifyMiddleware(ctx),
    handler(async (req, res) => {
      const {did, rkey} = req.params
      if (!DID_RE.test(did) || !RKEY_RE.test(rkey)) {
        return res.status(404).end('not found')
      }
      const uri = `at://${did}/community.lexicon.calendar.event/${rkey}`
      let event: EventView | undefined
      try {
        const url = new URL(
          '/xrpc/community.blacksky.calendar.getEvents',
          ctx.cfg.service.appviewUrl,
        )
        url.searchParams.set('uris', uri)
        const response = await fetch(url)
        if (response.ok) {
          const body = (await response.json()) as {events?: EventView[]}
          event = body.events?.[0]
        }
      } catch (err) {
        httpLogger.warn({err, uri}, 'could not fetch event')
      }
      const data =
        event &&
        toEventCardData(
          event.record,
          event.creator.displayName || `@${event.creator.handle}`,
          uri,
        )
      if (!event || !data) return res.status(404).end('not found')

      let cover: Buffer | null = null
      if (event.thumb) {
        try {
          cover = await getImage(event.thumb)
          if (cover && !isJpegOrPng(cover)) cover = null
        } catch (err) {
          httpLogger.warn({err, uri}, 'could not fetch event cover')
        }
      }

      const svg = await satori(<EventCard event={data} cover={cover} />, {
        fonts: ctx.fonts,
        height: EVENT_HEIGHT,
        width: EVENT_WIDTH,
        loadAdditionalAsset: async (lang, text) => {
          if (lang === 'emoji') {
            return (await loadEmojiAsSvg(text)) ?? ''
          }
          return ''
        },
      })
      const output = await resvg.renderAsync(svg)
      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('cdn-tag', did)
      return res.end(output.asPng())
    }),
  )
}
