import { test, expect } from 'vitest'
import { eq, ne } from 'drizzle-orm'
import { build } from '../helper'
import { apps, appVersions, userAppInstalls, users } from '../../src/db/schema'

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


test("install adds an app to the user's list when user is the creator", async (t) => {
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

  const [testVersion] = await db
    .insert(appVersions)
    .values({ appId: testApp.id, versionNumber: 1, isDraft: true })
    .returning()

  const response = await app.inject({ method: 'POST', url: `/apps/${testApp.id}/install` })

  const [installedApps] = await db
    .select({ versionId: userAppInstalls.versionId })
    .from(userAppInstalls).where(eq(userAppInstalls.userId, currentUser.id))

  expect(response.statusCode).toBe(201)
  expect(installedApps.versionId).toBe(testVersion.id)
})
