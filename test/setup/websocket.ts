import WebSocket from 'ws'

// Inject the `ws` WebSocket implementation as a global so that ConvexVueClient
// can be instantiated without passing `webSocketConstructor` explicitly —
// mirroring how the React test suite works via its custom-vitest-environment.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket
