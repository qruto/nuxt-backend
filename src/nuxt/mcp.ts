import { addServerHandler, addServerImports, type Resolver } from '@nuxt/kit'
import { defu } from 'defu'
import type { Nuxt } from '@nuxt/schema'
import { BACKEND_MCP_SCOPES, DEFAULT_MCP_EXCHANGE_PATH } from '../convex/constants'
import type { ModuleMcpOptions, ModuleOptions } from '../module'

// The agent (MCP) surface: the resolved `backend.mcp` options, the server
// imports, the runtime config, the middleware and the route rules.

/** Resolve `backend.mcp` into effective options. */
export function resolveMcpOptions(options: ModuleMcpOptions = {}): ModuleMcpOptions & { route: string } {
  return { ...options, route: options.route?.replace(/\/+$/, '') || '/mcp' }
}

/**
 * The agent (MCP) surface: contribute the built-in tools to the toolkit's
 * definition scan, publish the runtime config the gate/tools read, and mount
 * the route-scoped middleware — the OAuth gate on the MCP route plus the two
 * `/.well-known` discovery documents (registered as middleware so they answer
 * before the toolkit's 404 stubs on the same routes).
 */
export function registerMcp(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): void {
  const mcp = resolveMcpOptions(options.mcp)
  addServerImports([
    { name: 'useBackendMcp', from: resolver.resolve('./runtime/server/mcp/index') },
    { name: 'defineBackendMcpTool', from: resolver.resolve('./runtime/server/mcp/index') },
  ])

  // The toolkit's `useEvent`-based helpers — and our `useBackendMcp()` inside
  // tool handlers — read the current request through Nitro's async context.
  nuxt.options.nitro.experimental = defu(
    { asyncContext: true },
    nuxt.options.nitro.experimental,
  )

  // Everything the Nitro runtime needs (the gate, the discovery documents,
  // and the built-in tools' function lookups). Server-side only —
  // never exposed to the client bundle.
  nuxt.options.runtimeConfig.backendMcp = defu(
    nuxt.options.runtimeConfig.backendMcp as Record<string, unknown> | undefined,
    {
      route: mcp.route,
      authBase: options.authRoute ?? '/api/auth',
      exchangePath: DEFAULT_MCP_EXCHANGE_PATH,
      scopes: [...BACKEND_MCP_SCOPES],
      functions: { ...mcp.functions },
    },
  )

  // Contribute the built-in tool files to the toolkit's definition scan
  // (absolute paths pass through its layer-relative resolution).
  // The hook is declared by the toolkit's runtime types, which Nuxt's hook
  // map doesn't know at module-build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(nuxt.hook as any)('mcp:definitions:paths', (paths: { tools: string[] }) => {
    paths.tools.push(resolver.resolve('./runtime/server/mcp/tools'))
  })

  // Global middleware, matched in-handler: the OAuth gate owns the MCP route;
  // the discovery documents own their `/.well-known` prefixes (including the
  // RFC 8414/9728 path-suffix forms). Deliberately NOT route-scoped — h3
  // rewrites `event.path` relative to a `use(base, …)` mount (the base is
  // stripped), which would break the handlers' own full-path guards; each
  // handler early-returns on every other path, so the global hop is one
  // string compare.
  addServerHandler({
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/gate'),
  })
  addServerHandler({
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/protected-resource'),
  })
  addServerHandler({
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/authorization-server'),
  })

  // nuxt-security (chained through the base module) would throttle long agent
  // sessions with its IP rate limiter, reject tool args that look like markup
  // (xssValidator), and take over CORS on the discovery documents — the MCP
  // surface has its own guards (OAuth + the deployment's `mcp` limit). Inert
  // when nuxt-security isn't installed.
  const routeRules = (nuxt.options.routeRules ??= {})
  const relax = { security: { rateLimiter: false as const, xssValidator: false as const, corsHandler: false as const } }
  for (const route of [mcp.route, `${mcp.route}/**`]) {
    routeRules[route] = defu(routeRules[route], relax)
  }
  for (const route of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/**',
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server/**',
  ]) {
    routeRules[route] = defu(routeRules[route], { security: { corsHandler: false as const } })
  }
}
