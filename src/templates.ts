import dedent from 'dedent'

const AUTH_CONFIG_TEMPLATE = `export { default } from 'nuxt-backend/convex/auth.config'\n`
const HTTP_TEMPLATE = dedent`
  import { httpRouter } from 'convex/server'
  import { authComponent, createAuth } from './auth'

  const http = httpRouter()
  authComponent.registerRoutes(http, createAuth)

  export default http
  ` + '\n'

/**
 * Auto-scaffolded backend file templates.
 *
 * Each key is a filename relative to the backend functions directory;
 * the value is the file content that will be written when the file
 * does not yet exist.
 */
export const BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': dedent`
    import { defineApp } from 'convex/server'
    import backend from 'nuxt-backend/convex/component/convex.config'

    const app = defineApp()
    app.use(backend)
    export default app
    ` + '\n',
  'auth.config.ts': AUTH_CONFIG_TEMPLATE,
  'auth.ts': dedent`
    import { setupAuth } from 'nuxt-backend/convex'
    import { components } from './_generated/api'
    import { query } from './_generated/server'

    export const {
      authComponent,
      createAuthOptions,
      options,
      createAuth,
      getAuthUser,
    } = setupAuth(components.backend, query)
    ` + '\n',
  'http.ts': HTTP_TEMPLATE,
}

export type BackendInstallationMode = 'default' | 'local'

export interface BackendTemplateOptions {
  installation?: BackendInstallationMode
}

export const LOCAL_BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': dedent`
    import { defineApp } from 'convex/server'
    import backend from './components/backend/convex.config'

    const app = defineApp()
    app.use(backend)
    export default app
    ` + '\n',
  'auth.config.ts': AUTH_CONFIG_TEMPLATE,
  'auth.ts': dedent`
    import { setupAuth } from 'nuxt-backend/convex'
    import { components } from './_generated/api'
    import { query } from './_generated/server'
    import schema from './components/backend/schema'

    export const {
      authComponent,
      createAuthOptions,
      options,
      createAuth,
      getAuthUser,
    } = setupAuth(components.backend, query, { schema })
    ` + '\n',
  'http.ts': HTTP_TEMPLATE,
  'components/backend/convex.config.ts': dedent`
    import { defineComponent } from 'convex/server'

    export default defineComponent('backend')
    ` + '\n',
  'components/backend/generated-schema.ts': `export { tables } from 'nuxt-backend/convex/component/schema'\n`,
  'components/backend/schema.ts': dedent`
    import { defineSchema } from 'convex/server'
    import { tables } from './generated-schema'

    export default defineSchema({
      ...tables,
    })
    ` + '\n',
  'components/backend/adapter.ts': dedent`
    import { createApi } from '@convex-dev/better-auth'
    import { createAuthOptions } from '../../auth'
    import schema from './schema'

    export const {
      create,
      findOne,
      findMany,
      updateOne,
      updateMany,
      deleteOne,
      deleteMany,
    } = createApi(schema, createAuthOptions)
    ` + '\n',
  'components/backend/auth.ts': dedent`
    import { createAuth } from '../../auth'

    export const auth = createAuth({} as any)
    ` + '\n',
}

export function getBackendFileTemplates(options: BackendTemplateOptions = {}) {
  return options.installation === 'local'
    ? LOCAL_BACKEND_FILE_TEMPLATES
    : BACKEND_FILE_TEMPLATES
}
