import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(__dirname, '../../data/apps')
const DRAFT_DIR = join(DATA_DIR, 'drafts')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(DRAFT_DIR, { recursive: true })

export function getDbPath(appId: string) {
  return join(DATA_DIR, `${appId}.db`)
}

export function openDb(appId: string) {
  return new Database(getDbPath(appId))
}

export function getDraftDbPath(appId: string) {
  return join(DRAFT_DIR, `${appId}.db`)
}

export function openDraftDb(appId: string) {
  return new Database(getDraftDbPath(appId))
}

// Future: per-user production DB — for now unused but path helper ready
export function getUserDbPath(appId: string, userId: string) {
  return join(DATA_DIR, appId, `${userId}.db`)
}
