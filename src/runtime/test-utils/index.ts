/**
 * Test helpers for an app's Vue side — `nuxt-backend/test-utils`:
 * {@link createBackendMock}, a fake backend and session that the package's
 * composables and components, and the base module's, read in a component or
 * page test; {@link resetBackendMock}, which forgets it;
 * {@link backendMockProvides}, what a plain `mount()` provides it with;
 * {@link backendTestAliases}, the Vitest aliases that point them at it, so a
 * test needs no `vi.mock`; and {@link renderEmail}, which renders an email
 * the package sends as your `setupEmail` options would. Your Convex functions
 * are tested with `nuxt-backend/test` instead.
 *
 * Experimental: the mock answers the way the auth and billing flows answer
 * today, and follows them as they move.
 *
 * @module
 * @experimental
 */
export { backendTestAliases } from './aliases.js'
export { renderEmail, type RenderEmailOptions } from './email.js'
export {
  backendMockProvides,
  createBackendMock,
  resetBackendMock,
  type BackendMock,
  type BackendMockCall,
  type BackendMockInit,
  type BackendMockInvitation,
  type BackendMockName,
  type BackendMockState,
  type BackendMockUser,
  type BackendMockWorkspace,
} from './mock.js'
