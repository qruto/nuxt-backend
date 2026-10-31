/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
import { paths } from './paths.generated'

// Trust the session tokens the backend signs, under the auth route
// nuxt.config names (`backend.authRoute`), which the Nuxt module writes
// to paths.generated.ts.
export default defineBackendAuthConfig({ paths })
