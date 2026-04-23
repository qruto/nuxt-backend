import WebSocket, { WebSocketServer } from 'ws'

// Let's pretend this ws WebSocket is a browser WebSocket (it's very close).
export const nodeWebSocket = WebSocket as unknown as typeof globalThis.WebSocket

/**
 * Minimal structural subset of Convex's internal `ClientMessage` type.
 *
 * We don't import the type from `convex` because it's not part of the
 * public package exports. Tests only need the `type` discriminator and a
 * handful of fields per message, so a structural type is enough.
 */
export type ClientMessage
  = | { type: 'Connect', sessionId: string, connectionCount: number, lastCloseReason?: string | null }
    | {
      type: 'ModifyQuerySet'
      baseVersion: number
      newVersion: number
      modifications: Array<{
        type: 'Add' | 'Remove'
        queryId: number
        udfPath?: string
        args?: unknown[]
      }>
    }
    | { type: 'Authenticate', baseVersion: number, value: string, tokenType?: string }
    | { type: 'Mutation', requestId: string, udfPath: string, args: unknown[] }
    | { type: 'Action', requestId: string, udfPath: string, args: unknown[] }
    | { type: 'Event', requestId: string, eventType: string, event: Record<string, unknown> }
    | { type: string, [key: string]: unknown }

/**
 * Minimal structural subset of Convex's internal `WireServerMessage` used in
 * tests. Like {@link ClientMessage}, this is structural so tests don't need
 * access to Convex internals.
 */
export type WireServerMessage = {
  type: string
  [key: string]: unknown
}

/**
 * Encode an unsigned 64-bit integer as a base64-encoded little-endian byte
 * string, the on-the-wire representation Convex uses for its `ts` fields.
 *
 * We implement this locally instead of importing Convex's `Long` class
 * because `convex/browser/sync/protocol` is not part of the package's public
 * exports. Values are limited to the safe integer range, which is more than
 * enough for tests that drive deterministic timestamps.
 */
export function encodeU64LE(value: number): string {
  const n = BigInt(value)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(n, 0)
  return buffer.toString('base64')
}

export type InMemoryWebSocketTest = (args: {
  address: string
  socket: () => WebSocket
  receive: () => Promise<ClientMessage>
  send: (message: WireServerMessage) => void
  close: () => void
}) => Promise<void>

type ActiveSocket = {
  send(data: string): void
  close(): void
}

function closeActiveSocket(activeSocket: ActiveSocket | null): void {
  if (activeSocket !== null) {
    activeSocket.close()
  }
}

function listeningSocketServer(): Promise<WebSocketServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 })
    wss.on('listening', () => resolve(wss))
  })
}

/**
 * Run a test against a real Node WebSocket server whose messages the test
 * script fully controls.
 *
 * Mirrors the upstream `withInMemoryWebSocket` helper from
 * `convex-js/src/browser/sync/client_node_test_helpers.ts`. Adapted for this
 * repository: structural message types and a local u64 encoder are used so
 * that no `convex/*` internal modules need to be imported.
 */
export async function withInMemoryWebSocket(
  cb: InMemoryWebSocketTest,
  debug = false,
): Promise<void> {
  // These state variables are consistent over multiple sockets.
  let received!: (msg: string) => void
  const messages: Array<Promise<string>> = [
    new Promise<string>((r) => {
      received = r
    }),
  ]
  let socket: ActiveSocket | null = null

  const wss = await listeningSocketServer()

  const setUpSocket = () => {
    wss.once('connection', (ws: WebSocket) => {
      socket = ws
      ws.on('message', (data: WebSocket.RawData) => {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        received(text)
        if (debug) {
          console.debug(`client --${JSON.parse(text).type}--> `)
        }
        messages.push(
          new Promise<string>((r) => {
            received = r
          }),
        )
      })
    })
  }
  setUpSocket()

  async function receive(): Promise<ClientMessage> {
    const msgP = messages.shift()
    if (!msgP) {
      throw new Error('receive() called without a pending message promise.')
    }
    const text = await msgP
    return JSON.parse(text) as ClientMessage
  }

  function send(message: WireServerMessage): void {
    if (debug) {
      console.debug(`      <--${message.type}-- server`)
    }
    if (!socket) {
      throw new Error('send() called before a client connected.')
    }
    socket.send(JSON.stringify(message))
  }

  const addressInfo = wss.address()
  if (addressInfo === null) {
    throw new Error('WebSocket server address is unavailable.')
  }
  const address
    = typeof addressInfo === 'string'
      ? addressInfo
      : `http://127.0.0.1:${addressInfo.port}`

  try {
    await cb({
      address,
      socket: () => socket as unknown as WebSocket,
      receive,
      send,
      close: () => {
        if (debug) {
          console.debug(`           --CLOSE-->8-- server`)
        }
        closeActiveSocket(socket)
        setUpSocket()
      },
    })
  }
  finally {
    closeActiveSocket(socket)
    wss.close()
  }
}
