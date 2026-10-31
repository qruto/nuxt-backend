import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

// The strip functions on convex-test, with every component the scaffold
// mounts and a real session for each caller. No provider is called. A new
// workspace has no credits yet, so a strip waits for them.
const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('a strip belongs to the workspace it was made in', async () => {
  const t = testApp()
  const ada = await asUser(t)
  const grace = await asUser(t)
  const id = await ada.mutation(api.strips.create, { idea: 'A cat learns to surf' })
  expect(await ada.query(api.strips.get, { id })).toMatchObject({ idea: 'A cat learns to surf' })
  expect(await grace.query(api.strips.get, { id })).toBeNull()
})

test('a strip waits for credits', async () => {
  const ada = await asUser(testApp())
  const id = await ada.mutation(api.strips.create, { idea: 'A cat learns to surf' })
  // No credits have reached the new workspace: generate is refused, and the
  // refusal rolled the whole mutation back.
  await expect(ada.mutation(api.strips.generate, { id })).rejects.toMatchObject({ data: { code: 'not_ready' } })
  expect(await ada.query(api.strips.get, { id })).toMatchObject({ status: 'draft' })
})
