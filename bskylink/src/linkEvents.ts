import {type Insertable} from 'kysely'

import {type AppContext} from './context.js'
import {type LinkEvent} from './db/schema.js'
import {dbLogger} from './logger.js'

export async function trackLinkEvent(
  ctx: AppContext,
  event: Insertable<LinkEvent>,
): Promise<void> {
  try {
    await ctx.db.db.insertInto('link_event').values(event).execute()
  } catch (err) {
    dbLogger.error({err, event}, 'failed to record link event')
  }
}
