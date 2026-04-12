import { defineApp } from 'convex/server'
import backend from './convex.config'
import { DEFAULT_AUTH_ROUTE } from './constants'

export type BackendApp = ReturnType<typeof defineApp>

export interface DefineBackendAppOptions {
  name?: string
  httpPrefix?: string
}

export function defineBackendApp(options: DefineBackendAppOptions = {}): BackendApp {
  const app = defineApp()
  app.use(backend, {
    name: options.name,
    httpPrefix: options.httpPrefix ?? DEFAULT_AUTH_ROUTE,
  })
  return app
}

const _default: BackendApp = defineBackendApp()
export default _default
