/**
 * JUMBF (ISO/IEC 19566-5), the box format a C2PA manifest store is written
 * in: a superbox (`jumb`) holds a description box (`jumd`: its type as a
 * UUID, and its label) and its content boxes. C2PA names each superbox's
 * type with a UUID built from a four-letter code (C2PA 2.x, "JUMBF type
 * UUIDs").
 */
import { concatBytes } from '../bytes.js'

const encoder = new TextEncoder()

/** The UUID of a C2PA JUMBF type: its four-letter code, then the ISO suffix every C2PA type shares. */
function c2paType(code: string): Uint8Array {
  return concatBytes([encoder.encode(code), Uint8Array.from([0x00, 0x11, 0x00, 0x10, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71])])
}

/** The JUMBF types a manifest store is made of. */
export const JUMBF_TYPES = {
  store: c2paType('c2pa'),
  manifest: c2paType('c2ma'),
  assertions: c2paType('c2as'),
  claim: c2paType('c2cl'),
  signature: c2paType('c2cs'),
  cbor: c2paType('cbor'),
} as const

/** A box: its length (header included), its four-letter type, its payload. */
export function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(encoder.encode(type), 4)
  out.set(payload, 8)
  return out
}

/** A superbox: its description (requestable, labelled) and its content boxes. */
export function superbox(type: Uint8Array, label: string, contents: readonly Uint8Array[]): Uint8Array {
  // Toggles 0x03: requestable, with a label.
  const description = box('jumd', concatBytes([type, Uint8Array.of(0x03), encoder.encode(label), Uint8Array.of(0)]))
  return box('jumb', concatBytes([description, ...contents]))
}

/** A superbox holding one CBOR content box: an assertion, a claim or a signature. */
export function cborSuperbox(type: Uint8Array, label: string, cbor: Uint8Array): Uint8Array {
  return superbox(type, label, [box('cbor', cbor)])
}
