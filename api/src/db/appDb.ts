import Database from 'better-sqlite3'
import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'

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

// Wipe `targetPath` and recreate it with `schemaSQL` applied. No-op if the schema
// is empty (the caller just gets a fresh, tableless DB on next open).
function initDbWithSchema(targetPath: string, schemaSQL: string | null | undefined): void {
  if (existsSync(targetPath)) rmSync(targetPath)
  mkdirSync(dirname(targetPath), { recursive: true })
  if (!schemaSQL || schemaSQL.trim().length === 0) return
  const db = new Database(targetPath)
  try {
    db.exec(schemaSQL)
  } finally {
    db.close()
  }
}

export function initUserDbWithSchema(appId: string, userId: string, schemaSQL: string | null | undefined): void {
  if (!schemaSQL || schemaSQL.trim().length === 0) return
  initDbWithSchema(getUserDbPath(appId, userId), schemaSQL)
}

export function copyUserDbToDraft(appId: string, userId: string, schemaSQL?: string | null): void {
  const src = getUserDbPath(appId, userId)
  const target = getDraftDbPath(appId, userId)
  if (existsSync(src)) {
    // The installed DB already carries the schema plus the user's data — clone it.
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(src, target)
    return
  }
  // No installed DB to seed from (e.g. the creator editing an app they never
  // installed) — initialise a fresh draft DB with the version's schema so the
  // preview can query its tables immediately.
  initDbWithSchema(target, schemaSQL)
}
