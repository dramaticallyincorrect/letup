import Database from 'better-sqlite3'
import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../data/apps')
const DRAFT_DIR = join(DATA_DIR, 'drafts')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(DRAFT_DIR, { recursive: true })

// data/apps/appid/userId.db

function getDraftDbPath(appId: string, userId: string) {
  return join(DRAFT_DIR, appId, `${userId}.db`)
}

export function openDraftDb(userId: string, appId: string) {
  const draftAppDir = join(DRAFT_DIR, appId)
  mkdirSync(draftAppDir, { recursive: true })
  return new Database(getDraftDbPath(appId, userId))
}

function getAppDbDirectory(appId: string) {
  return join(DATA_DIR, appId)
}

function getUserDbPath(appId: string, userId: string) {
  return join(getAppDbDirectory(appId), `${userId}.db`)
}

export function openUserDb(appId: string, userId: string) {
  mkdirSync(getAppDbDirectory(appId), { recursive: true })
  return new Database(getUserDbPath(appId, userId))
}

export function copyDraftToUserDb(appId: string, userId: string): void {
  const src = getDraftDbPath(appId, userId)
  if (existsSync(src)) {
    mkdirSync(getAppDbDirectory(appId), { recursive: true })
    copyFileSync(src, getUserDbPath(appId, userId))
    rmSync(src)
  }
}

export function initUserDbWithSchema(appId: string, userId: string, schemaSQL: string | null | undefined): void {
  if (!schemaSQL || schemaSQL.trim().length === 0) return
  const target = getUserDbPath(appId, userId)
  if (existsSync(target)) rmSync(target)
  mkdirSync(getAppDbDirectory(appId), { recursive: true })
  const db = new Database(target)
  try {
    db.exec(schemaSQL)
  } finally {
    db.close()
  }
}

export function copyUserDbToDraft(appId: string, userId: string): void {
  const src = getUserDbPath(appId, userId)
  if (existsSync(src))
    copyFileSync(src, getDraftDbPath(appId, userId))
  else
    openDraftDb(userId, appId)
}
