import { ne, isNull, or, eq } from 'drizzle-orm'
import type { DB } from './db'
import { users, apps } from './db/schema'

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

let _currentUserId: string | null = null

export async function initCurrentUser(db: DB): Promise<void> {
  // Find the first real (non-system) user
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(ne(users.handle, 'system'))
    .limit(1)

  if (existing) {
    _currentUserId = existing.id
  } else {
    const [created] = await db
      .insert(users)
      .values({ handle: 'me', displayName: 'Me' })
      .returning({ id: users.id })
    _currentUserId = created.id
  }

  // Backfill apps that have no creator or were assigned to the system placeholder
  await db
    .update(apps)
    .set({ creatorId: _currentUserId })
    .where(or(isNull(apps.creatorId), eq(apps.creatorId, SYSTEM_USER_ID)))
}

export function getCurrentUserId(): string {
  if (!_currentUserId) throw new Error('currentUser not initialized — ensure initCurrentUser was called at startup')
  return _currentUserId
}
