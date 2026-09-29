import { existsSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'
import type { Resolver } from '@nuxt/kit'
import { registerDevtools } from './register'
import { createDevtoolsRpc } from './rpc'
import { DEVTOOLS_UI_LOCAL_PORT, DEVTOOLS_UI_ROUTE, RPC_NAMESPACE, type DevtoolsDeploymentEnv, type DevtoolsServerInfo } from './rpc-types'

/** What the module hands the DevTools RPC — build-time facts, re-read live. */
export interface DevtoolsServerContext {
  rootDir: string
  functionsDir: string
  /** Called per request, so findings stay live; given the last deployment env read. */
  getInfo(deploymentEnv: DevtoolsDeploymentEnv | null): DevtoolsServerInfo
}

/** Env files and codegen: the dev-server facts the panel shows. */
const INFO_SOURCES = /(?:^|\/)(?:\.env(?:\.local)?|_generated\/api\.(?:d\.ts|js))$/

/**
 * Wire the Backend panel into Nuxt DevTools (dev-only; lazily imported so
 * `@nuxt/devtools-kit` never loads in production builds):
 *
 * - serve the panel app — from `dist/devtools-client` via sirv in the
 *   published package, or proxied to the `pnpm dev:devtools-client` dev server
 *   while developing this module (the `./devtools-client` dir doesn't exist
 *   next to the stub);
 * - register the iframe tab (a sibling of the base module's Convex tab —
 *   connection/queries/auth state stay over there);
 * - expose the server-side RPC, and push fresh facts to an open panel when an
 *   env file or the codegen changes — live app state reaches the panel
 *   through the in-page bridge instead.
 */
export function setupDevtools(resolver: Resolver, nuxt: Nuxt, context: DevtoolsServerContext): void {
  const staticDir = resolver.resolve('./devtools-client')

  let timer: ReturnType<typeof setTimeout> | undefined
  const pushInfo = () => {
    clearTimeout(timer)
    timer = setTimeout(() => handle.broadcast.onInfo(rpc.functions.getInfo()), 300)
    timer.unref?.()
  }

  const rpc = createDevtoolsRpc({
    rootDir: context.rootDir,
    functionsDir: context.functionsDir,
    buildInfo: context.getInfo,
    onDeploymentEnvRead: pushInfo,
  })

  const handle = registerDevtools(nuxt, {
    tab: { name: 'nuxt-backend', title: 'Backend', icon: `${DEVTOOLS_UI_ROUTE}/icon.svg` },
    route: DEVTOOLS_UI_ROUTE,
    staticDir: existsSync(staticDir) ? staticDir : null,
    proxyPort: DEVTOOLS_UI_LOCAL_PORT,
    rpc: { namespace: RPC_NAMESPACE, functions: rpc.functions },
  })

  nuxt.hook('builder:watch', (_event, path) => {
    const normalized = path.replace(/\\/g, '/')
    if (!INFO_SOURCES.test(normalized)) return
    if (normalized.includes('.env')) rpc.invalidate()
    pushInfo()
  })
}
