import { pgTable, pgEnum, text, timestamp, uuid, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const pipelineKindEnum = pgEnum('pipeline_kind', ['shell', 'agent'])

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const columns = pgTable('board_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  pipelineKind: pipelineKindEnum('pipeline_kind'),
  // used when pipelineKind = 'agent'
  prompt: text('prompt'),
  dataSchema: jsonb('data_schema'),
  cardRenderer: text('card_renderer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// each row is one command in a shell pipeline, ordered by position
export const columnCommands = pgTable('column_commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  columnId: uuid('column_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  command: text('command').notNull(),
})

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  columnId: uuid('column_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  data: jsonb('data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const boardsRelations = relations(boards, ({ many }) => ({
  columns: many(columns),
}))

export const columnsRelations = relations(columns, ({ one, many }) => ({
  board: one(boards, { fields: [columns.boardId], references: [boards.id] }),
  commands: many(columnCommands),
  cards: many(cards),
}))

export const columnCommandsRelations = relations(columnCommands, ({ one }) => ({
  column: one(columns, { fields: [columnCommands.columnId], references: [columns.id] }),
}))

export const cardsRelations = relations(cards, ({ one }) => ({
  column: one(columns, { fields: [cards.columnId], references: [columns.id] }),
}))
