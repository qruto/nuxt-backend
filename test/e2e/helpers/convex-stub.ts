import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'

export interface RecordedRequest {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

export type FunctionKind = 'query' | 'mutation' | 'action'

/** One Convex function call the stub served, over HTTP or the sync WebSocket. */
export interface RecordedCall {
  kind: FunctionKind
  /** Canonical `module:function` path, e.g. `billing:getConfiguredProducts`. */
  path: string
  args: unknown
  transport: 'http' | 'ws'
}

/**
 * Answers one function path. Receives the call's first (and only) argument
 * object; the return value is sent back as the function result. Throw to
 * make the call fail the way a Convex function error would.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionHandler = (args: any, call: RecordedCall) => unknown

export interface HttpResponse {
  /** Default `200`. */
  status?: number
  headers?: Record<string, string>
  /** JSON-serialized; `undefined` sends an empty body. */
  body?: unknown
}

export type RouteHandler = (request: RecordedRequest) => HttpResponse | Promise<HttpResponse>

export interface ConvexStub {
  /** Base URL of the stub, e.g. `http://127.0.0.1:52341`. */
  url: string
  /** Every HTTP request the stub received, in order (WebSocket frames excluded). */
  requests: RecordedRequest[]
  /** Every function call served, over HTTP or WebSocket, in order. */
  calls: RecordedCall[]
  /**
   * Answer a function path (`module:function`) on every transport — the HTTP
   * `/api/query|mutation|action` endpoints and the sync WebSocket. `'*'`
   * catches every path without its own handler.
   */
  on: (path: string, handler: FunctionHandler) => ConvexStub
  off: (path: string) => ConvexStub
  /**
   * Answer an HTTP route (`'GET /api/auth/get-session'`). Overrides the
   * built-in Better Auth routes; unmatched routes echo their URL as JSON.
   */
  route: (key: `${string} ${string}`, handler: RouteHandler) => ConvexStub
  close: () => Promise<void>
}

export interface ConvexStubOptions {
  /** Function handlers to register up front (same as calling `on`). */
  handlers?: Record<string, FunctionHandler>
}

const SYNC_PATH = /^\/api\/[^/]+\/sync$/

/** The client → server sync frames the stub understands (structural subset of Convex's `ClientMessage`). */
type ClientMessage
  = | { type: 'Connect' }
    | { type: 'Event' }
    | {
      type: 'ModifyQuerySet'
      baseVersion: number
      newVersion: number
      modifications: Array<{ type: 'Add' | 'Remove', queryId: number, udfPath?: string, args?: unknown[] }>
    }
    | { type: 'Authenticate', baseVersion: number, tokenType?: string, value?: string }
    | { type: 'Mutation', requestId: string, udfPath: string, args?: unknown[] }
    | { type: 'Action', requestId: string, udfPath: string, args?: unknown[] }

/** `module:function`; a bare module means its default export (`module:default`). */
function canonicalizeUdfPath(udfPath: string): string {
  const pieces = udfPath.split(':')
  const moduleName = (pieces.length === 1 ? pieces[0]! : pieces.slice(0, -1).join(':')).replace(/\.js$/, '')
  const functionName = pieces.length === 1 ? 'default' : pieces[pieces.length - 1]!
  return `${moduleName}:${functionName}`
}

/**
 * The sync protocol's `Long` timestamp encoding: 8 little-endian bytes,
 * base64 (`longToU64` in `convex/browser/sync/protocol`).
 */
function encodeTs(ts: bigint): string {
  const bytes = Buffer.alloc(8)
  bytes.writeBigInt64LE(ts)
  return bytes.toString('base64')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The Better Auth routes the module's proxy and server helpers reach out to. */
function defaultRoutes(url: () => string): Record<string, RouteHandler> {
  return {
    // Signed out: Better Auth answers `null` for a session-less request.
    'GET /api/auth/get-session': () => ({ body: null }),
    // The Convex JWT the SSR plugin prefetches — none without a session.
    'GET /api/auth/convex/token': () => ({ body: { token: null } }),
    'POST /api/auth/email-otp/send-verification-otp': () => ({ body: { success: true } }),
    // RFC 8414 document the better-auth mcp plugin serves; the module's
    // `/.well-known/oauth-authorization-server` route proxies it.
    'GET /api/auth/.well-known/oauth-authorization-server': () => ({
      body: {
        issuer: url(),
        authorization_endpoint: `${url()}/api/auth/mcp/authorize`,
        token_endpoint: `${url()}/api/auth/mcp/token`,
        registration_endpoint: `${url()}/api/auth/mcp/register`,
        jwks_uri: `${url()}/api/auth/mcp/jwks`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      },
    }),
  }
}

/**
 * A minimal Convex deployment stand-in for e2e tests: the HTTP function
 * endpoints (`/api/query`, `/api/mutation`, `/api/action`) and the realtime
 * sync WebSocket, both answered from one per-function `handlers` map, plus
 * the Better Auth routes the module proxies to the deployment's site URL —
 * so `backend.url` and `backend.siteUrl` can both point here. Every HTTP
 * request and every function call is recorded for assertions.
 */
export function startConvexStub(options: ConvexStubOptions = {}): Promise<ConvexStub> {
  const requests: RecordedRequest[] = []
  const calls: RecordedCall[] = []
  const handlers = new Map<string, FunctionHandler>(
    Object.entries(options.handlers ?? {}).map(([path, handler]) => [canonicalizeUdfPath(path), handler]),
  )
  const routes = new Map<string, RouteHandler>()
  let baseUrl = ''
  for (const [key, handler] of Object.entries(defaultRoutes(() => baseUrl))) routes.set(key, handler)

  // Transition timestamps must only ever grow, across connections too.
  let lastTs = 0n
  const nextTs = () => ++lastTs

  async function invoke(kind: FunctionKind, udfPath: string, args: unknown, transport: RecordedCall['transport']): Promise<unknown> {
    const path = canonicalizeUdfPath(udfPath)
    const call: RecordedCall = { kind, path, args, transport }
    calls.push(call)
    const handler = handlers.get(path) ?? handlers.get('*')
    if (!handler) {
      throw new Error(`Could not find public function for '${path}'. Register it with stub.on('${path}', …).`)
    }
    return handler(args, call)
  }

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const request: RecordedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }
      requests.push(request)
      void respond(request).then(({ status = 200, headers = {}, body }) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
        res.end(body === undefined ? undefined : JSON.stringify(body))
      })
    })
  })

  async function respond(request: RecordedRequest): Promise<HttpResponse> {
    const pathname = request.url.split('?')[0] ?? ''
    const kind = ({
      '/api/query': 'query',
      '/api/query_at_ts': 'query',
      '/api/mutation': 'mutation',
      '/api/action': 'action',
    } as Record<string, FunctionKind | undefined>)[pathname]
    if (kind) {
      // The `ConvexHttpClient` wire shape: `{ path, format, args: [argsObject] }`
      // in, `{ status, value | errorMessage, logLines }` out.
      const { path, args } = JSON.parse(request.body || '{}') as { path: string, args?: unknown[] }
      try {
        const value = await invoke(kind, path, args?.[0] ?? {}, 'http')
        return { body: { status: 'success', value: value ?? null, logLines: [] } }
      }
      catch (error) {
        return { body: { status: 'error', errorMessage: errorMessage(error), logLines: [] } }
      }
    }

    const route = routes.get(`${request.method} ${pathname}`)
    if (route) return route(request)

    return {
      // The auth proxy must relay upstream cookies (session cookies) verbatim.
      headers: { 'Set-Cookie': 'stub-session=abc; Path=/; HttpOnly' },
      body: { echoed: request.url },
    }
  }

  // The realtime sync channel (`convex/browser/sync`): one version vector per
  // connection, every ModifyQuerySet / Authenticate answered with a Transition
  // from the client's current version, mutations and actions with their
  // response messages. Enough for `useQuery` & co. to settle in a browser.
  const sockets = new Set<WebSocket>()
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    if (!SYNC_PATH.test(req.url?.split('?')[0] ?? '')) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  })
  wss.on('connection', (ws: WebSocket) => {
    sockets.add(ws)
    const version = { querySet: 0, identity: 0, ts: 0n }
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
    }
    const transition = (end: { querySet?: number, identity?: number }, modifications: unknown[]) => {
      const endVersion = { querySet: end.querySet ?? version.querySet, identity: end.identity ?? version.identity, ts: nextTs() }
      send({
        type: 'Transition',
        startVersion: { ...version, ts: encodeTs(version.ts) },
        endVersion: { ...endVersion, ts: encodeTs(endVersion.ts) },
        modifications,
      })
      Object.assign(version, endVersion)
    }
    // The client reconnects after 60s of server silence.
    const ping = setInterval(() => send({ type: 'Ping' }), 10_000)
    ping.unref()

    ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as ClientMessage
      void handleSyncMessage(message).catch((error: unknown) => {
        send({ type: 'FatalError', error: errorMessage(error) })
      })
    })
    ws.on('close', () => {
      clearInterval(ping)
      sockets.delete(ws)
    })

    async function handleSyncMessage(message: ClientMessage): Promise<void> {
      switch (message.type) {
        case 'Connect':
        case 'Event':
          return
        case 'ModifyQuerySet': {
          const { baseVersion, newVersion, modifications } = message
          const results: unknown[] = []
          for (const modification of modifications) {
            if (modification.type === 'Remove') {
              results.push({ type: 'QueryRemoved', queryId: modification.queryId })
              continue
            }
            try {
              const value = await invoke('query', modification.udfPath!, modification.args?.[0] ?? {}, 'ws')
              results.push({ type: 'QueryUpdated', queryId: modification.queryId, value: value ?? null, logLines: [] })
            }
            catch (error) {
              results.push({ type: 'QueryFailed', queryId: modification.queryId, errorMessage: errorMessage(error), logLines: [] })
            }
          }
          version.querySet = baseVersion
          transition({ querySet: newVersion }, results)
          return
        }
        case 'Authenticate': {
          // Any token (or `tokenType: 'None'`) is accepted as-is: the identity
          // version bump is what the client waits for.
          const { baseVersion } = message
          version.identity = baseVersion
          transition({ identity: baseVersion + 1 }, [])
          return
        }
        case 'Mutation':
        case 'Action': {
          const { requestId, udfPath, args } = message
          const kind: FunctionKind = message.type === 'Mutation' ? 'mutation' : 'action'
          const responseType = kind === 'mutation' ? 'MutationResponse' : 'ActionResponse'
          try {
            const result = await invoke(kind, udfPath, args?.[0] ?? {}, 'ws')
            if (kind === 'action') {
              send({ type: responseType, requestId, success: true, result: result ?? null, logLines: [] })
              return
            }
            // A mutation completes for the client once a Transition reaches
            // its timestamp — send the response, then an empty Transition.
            const ts = nextTs()
            send({ type: responseType, requestId, success: true, result: result ?? null, ts: encodeTs(ts), logLines: [] })
            send({
              type: 'Transition',
              startVersion: { ...version, ts: encodeTs(version.ts) },
              endVersion: { querySet: version.querySet, identity: version.identity, ts: encodeTs(ts) },
              modifications: [],
            })
            version.ts = ts
          }
          catch (error) {
            send({ type: responseType, requestId, success: false, result: errorMessage(error), logLines: [] })
          }
          return
        }
        default:
          throw new Error(`Unsupported sync message: ${(message as { type: string }).type}`)
      }
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
      const stub: ConvexStub = {
        url: baseUrl,
        requests,
        calls,
        on(path, handler) {
          handlers.set(path === '*' ? path : canonicalizeUdfPath(path), handler)
          return stub
        },
        off(path) {
          handlers.delete(path === '*' ? path : canonicalizeUdfPath(path))
          return stub
        },
        route(key, handler) {
          routes.set(key, handler)
          return stub
        },
        close: () => new Promise((done, fail) => {
          for (const ws of sockets) ws.terminate()
          wss.close()
          server.closeAllConnections()
          server.close(error => (error ? fail(error) : done()))
        }),
      }
      resolve(stub)
    })
  })
}
