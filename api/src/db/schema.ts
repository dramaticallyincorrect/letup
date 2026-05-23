import { pgTable, pgEnum, text, timestamp, uuid, jsonb, integer, boolean, unique, primaryKey, bigint, real } from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'approved', 'rejected'])



export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: text('creator_id').references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  conversationHistory: jsonb('conversation_history').notNull().default([]),
  displayHistory: jsonb('display_history').notNull().default([]),
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
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => appVersions.id, { onDelete: 'cascade' }),
  installedAt: timestamp('installed_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.versionId] })])

export const userCredits = pgTable('user_credits', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  balance: bigint('balance', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const marketplaceSubmissions = pgTable('marketplace_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().unique().references(() => appVersions.id, { onDelete: 'cascade' }),
  submittedBy: text('submitted_by').notNull().references(() => user.id),
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
  model: text('model'),
})

export const marketplaceStats = pgTable('marketplace_stats', {
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  installs: integer('installs').notNull().default(0),
  rating: text('rating'),
}, (t) => [primaryKey({ columns: [t.appId, t.date] })])

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
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

export const subscriptionEnum = pgEnum('subscription', ['free', 'pro'])

export const userSubscriptions = pgTable('user_subscriptions', {
  userId: text('user_id').primaryKey().references(() => user.id),
  plan: subscriptionEnum('plan').notNull().default('free'),           // 'free' | 'premium'
  paddleCustomerId: text('paddle_customer_id'),
  paddleSubscriptionId: text('paddle_subscription_id'),
  status: text('status').notNull().default('active'),      // 'active' | 'canceled' | 'past_due'
  currentPeriodEnd: timestamp('current_period_end'),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'annual'] }).notNull().default('monthly'),
  nextCreditRefillAt: timestamp('next_credit_refill_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});