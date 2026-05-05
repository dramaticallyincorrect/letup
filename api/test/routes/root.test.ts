import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper'

test('GET / returns { root: true }', async (t) => {
  const app = await build(t)

  const response = await app.inject({
    method: 'GET',
    url: '/',
  })

  assert.strictEqual(response.statusCode, 200)
  assert.deepStrictEqual(response.json(), { root: true })
})
