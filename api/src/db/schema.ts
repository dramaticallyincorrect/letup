import { pgTable, pgEnum, text, timestamp, uuid, jsonb, integer, boolean, unique, primaryKey, bigint, real } from 'drizzle-orm/pg-core'

export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'approved', 'rejected'])

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
  conversationHistory: jsonb('conversation_history').notNull().default([]),
  latestVersionNumber: integer('latest_version_number').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const appVersions = pgTable('app_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  isDraft: boolean('is_draft').notNull().default(false),
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

export const userCredits = pgTable('user_credits', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balance: bigint('balance', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const marketplaceSubmissions = pgTable('marketplace_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().unique().references(() => appVersions.id, { onDelete: 'cascade' }),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  category: text('category').notNull(),
  description: text('description').notNull(),
  status: submissionStatusEnum('status').notNull().default('pending'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const marketplaceListings = pgTable('marketplace_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().unique().references(() => apps.id, { onDelete: 'cascade' }),
  appVersionId: uuid('app_version_id').notNull().unique().references(() => appVersions.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
})

export const marketplaceStats = pgTable('marketplace_stats', {
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  installs: integer('installs').notNull().default(0),
  rating: text('rating'),
}, (t) => [primaryKey({ columns: [t.appId, t.date] })])

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  source: text('source').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  microUnitsUsed: bigint('micro_units_used', { mode: 'bigint' }).notNull(),
  appVersionId: uuid('app_version_id').references(() => appVersions.id, { onDelete: 'set null' }),
  userMessage: text('user_message'),
  buildSessionId: uuid('build_session_id'),
  durationSeconds: real('duration_seconds'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
