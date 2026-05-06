import { test, expect } from 'vitest'
import { build } from '../helper'

test('GET / returns { root: true }', async (t) => {
  const { app } = await build(t)

  const response = await app.inject({
    method: 'GET',
    url: '/',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ root: true })
})
