import WebSocket from 'ws'

// Inject the `ws` WebSocket implementation as a global so that ConvexVueClient
// can be instantiated without passing `webSocketConstructor` explicitly —
// matching the websocket setup used by this test suite.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket
