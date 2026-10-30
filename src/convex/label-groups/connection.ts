import type { LabelTree } from '../label-format.js'

/**
 * `<ConnectionStatus>`, in the status region of every ready-made page. It
 * says nothing while the live connection is up.
 */
const CONNECTION_LABELS = {
  // The live connection dropped, or never came up; the browser is online.
  reconnecting: 'Reconnecting…',
  offline: 'You\'re offline.',
  // Changes made meanwhile: the client sends them once the connection is back.
  pending: '{count} change is waiting to be sent. | {count} changes are waiting to be sent.',
} satisfies LabelTree

export default CONNECTION_LABELS
