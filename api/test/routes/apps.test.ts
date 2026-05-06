import { test, expect } from 'vitest'
import { ne } from 'drizzle-orm'
import { build } from '../helper'
import { apps, appVersions, users } from '../../src/db/schema'

test('GET /apps returns [] when no apps exist', async (t) => {
  const { app } = await build(t)

  const response = await app.inject({
    method: 'GET',
    url: '/apps',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual([])
})

test("GET /apps lists the current user's apps", async (t) => {
  const { app, db } = await build(t)

  const [currentUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(ne(users.handle, 'system'))
    .limit(1)

  const [testApp] = await db
    .insert(apps)
    .values({ name: 'My App', description: 'A test app', creatorId: currentUser.id })
    .returning()

  await db
    .insert(appVersions)
    .values({ appId: testApp.id, versionNumber: 1, isDraft: true })

  const response = await app.inject({ method: 'GET', url: '/apps' })

  expect(response.statusCode).toBe(200)
  const list = response.json()
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ id: testApp.id, name: 'My App' })
})
