import { defineComponent } from 'convex/server'

/**
 * Convex component that wraps Better Auth.
 *
 * We intentionally do NOT mount `@convex-dev/better-auth/convex.config` here.
 * The upstream component would surface as a separate `backend/betterAuth`
 * entry in the Convex dashboard and would never receive writes — our local
 * `schema.ts` + `adapter.ts` own all auth tables (the "hybrid component"
 * pattern documented at https://docs.convex.dev/components/authoring). The
 * `@convex-dev/better-auth` runtime is consumed as plain code only (via
 * `createApi` etc.).
 */
const component = defineComponent('backend')

export default component
