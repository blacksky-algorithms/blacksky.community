import {type Kysely, sql} from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('link_event')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('event', 'varchar', col => col.notNull())
    .addColumn('link', 'varchar')
    .addColumn('host', 'varchar')
    .addColumn('linkId', 'varchar')
    .addColumn('whitelisted', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('blocked', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('warned', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('utmSource', 'varchar')
    .addColumn('utmMedium', 'varchar')
    .addColumn('utmCampaign', 'varchar')
    .addColumn('utmContent', 'varchar')
    .addColumn('utmTerm', 'varchar')
    .addColumn('referrer', 'varchar')
    .addColumn('createdAt', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute()

  await db.schema
    .createIndex('link_event_host_created_at_idx')
    .on('link_event')
    .columns(['host', 'createdAt'])
    .execute()

  await db.schema
    .createIndex('link_event_link_id_created_at_idx')
    .on('link_event')
    .columns(['linkId', 'createdAt'])
    .execute()

  await db.schema
    .createIndex('link_event_created_at_idx')
    .on('link_event')
    .column('createdAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('link_event_created_at_idx').execute()
  await db.schema.dropIndex('link_event_link_id_created_at_idx').execute()
  await db.schema.dropIndex('link_event_host_created_at_idx').execute()
  await db.schema.dropTable('link_event').execute()
}
