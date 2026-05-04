import { pgTable, pgEnum, text, timestamp, uuid, jsonb, integer, unique, primaryKey } from 'drizzle-orm/pg-core'

export const appStatusEnum = pgEnum('app_status', ['draft', 'published'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: appStatusEnum('status').notNull().default('draft'),
  conversationHistory: jsonb('conversation_history').notNull().default([]),
  latestVersionNumber: integer('latest_version_number').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const appVersions = pgTable('app_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  compiledCode: text('compiled_code'),
  cssCode: text('css_code'),
  sourceFiles: jsonb('source_files').$type<Array<{ path: string; content: string }>>().default([]),
  dbSchema: text('db_schema'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.appId, t.versionNumber)])

export const userAppInstalls = pgTable('user_app_installs', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => appVersions.id, { onDelete: 'cascade' }),
  installedAt: timestamp('installed_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.versionId] })])
