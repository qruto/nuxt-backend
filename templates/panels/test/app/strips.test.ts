import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import { afterEach, expect, test } from 'vitest'
import StripsPage from '~/pages/strips/index.vue'

// A page over the mock backend: a fake backend and session, no deployment.
afterEach(() => resetBackendMock())

test('the list shows the workspace\'s strips', async () => {
  createBackendMock({
    user: { name: 'Ada' },
    queries: {
      'strips:list': [{ _id: 'strip_1', idea: 'A cat learns to surf', status: 'ready', panels: [] }],
    },
  })
  const page = await mountSuspended(StripsPage)
  expect(page.text()).toContain('A cat learns to surf')
})
