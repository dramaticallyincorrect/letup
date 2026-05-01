import { pgTable, pgEnum, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'

export const widgetStatusEnum = pgEnum('widget_status', ['draft', 'published'])

export const widgets = pgTable('widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: widgetStatusEnum('status').notNull().default('draft'),
  sourceCode: text('source_code'),
  compiledCode: text('compiled_code'),
  cssCode: text('css_code'),
  sourceFiles: jsonb('source_files').notNull().default([]).$type<Array<{ path: string; content: string }>>(),
  conversationHistory: jsonb('conversation_history').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
