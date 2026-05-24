import Database from 'better-sqlite3'
import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../data/apps')
const DRAFT_DIR = join(DATA_DIR, 'drafts')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(DRAFT_DIR, { recursive: true })

export function getDraftDbPath(appId: string) {
  return join(DRAFT_DIR, `${appId}.db`)
}

export function openDraftDb(appId: string) {
  return new Database(getDraftDbPath(appId))
}

export function getUserDbDir(appId: string) {
  return join(DATA_DIR, appId)
}

export function getUserDbPath(appId: string, userId: string) {
  return join(DATA_DIR, appId, `${userId}.db`)
}

export function openUserDb(appId: string, userId: string) {
  mkdirSync(getUserDbDir(appId), { recursive: true })
  return new Database(getUserDbPath(appId, userId))
}

export function copyDraftToUserDb(appId: string, userId: string): void {
  const src = getDraftDbPath(appId)
  if (existsSync(src)) {
    mkdirSync(getUserDbDir(appId), { recursive: true })
    copyFileSync(src, getUserDbPath(appId, userId))
    rmSync(src)
  }
}

export function copyUserDbToDraft(appId: string, userId: string): void {
  const src = getUserDbPath(appId, userId)
  if (existsSync(src)) copyFileSync(src, getDraftDbPath(appId))
}
