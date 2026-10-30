/**
 * The CBOR a C2PA manifest is written in (RFC 8949): the deterministic
 * subset its claims, assertions and COSE signature use — unsigned and
 * negative integers, byte and text strings, arrays, maps with keys in the
 * order given, tags, booleans and null. Encoding only: the package writes
 * manifests, verifiers read them.
 */
import { concatBytes } from '../bytes.js'

/** A tagged value: COSE_Sign1 is tag 18. */
export class Tagged {
  readonly tag: number
  readonly value: CborValue
  constructor(tag: number, value: CborValue) {
    this.tag = tag
    this.value = value
  }
}

export type CborValue
  = | number
    | string
    | boolean
    | null
    | Uint8Array
    | Tagged
    | readonly CborValue[]
    | ReadonlyMap<number | string, CborValue>
    | { readonly [key: string]: CborValue }

const encoder = new TextEncoder()

/** A head: the major type and its argument, in the shortest form. */
function head(major: number, argument: number): number[] {
  const type = major << 5
  if (argument < 24) return [type | argument]
  if (argument < 0x100) return [type | 24, argument]
  if (argument < 0x10000) return [type | 25, argument >> 8, argument & 0xFF]
  if (argument < 0x100000000) return [type | 26, (argument >>> 24) & 0xFF, (argument >> 16) & 0xFF, (argument >> 8) & 0xFF, argument & 0xFF]
  throw new RangeError('CBOR: an integer above 2^32 is never written here.')
}

/** A value that is no container: null, a boolean, an integer, a text or a byte string. */
function scalar(value: CborValue): Uint8Array[] | null {
  if (value === null) return [Uint8Array.of(0xF6)]
  if (typeof value === 'boolean') return [Uint8Array.of(value ? 0xF5 : 0xF4)]
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError('CBOR: only integers are written here.')
    return [Uint8Array.from(value >= 0 ? head(0, value) : head(1, -1 - value))]
  }
  if (typeof value === 'string') {
    const bytes = encoder.encode(value)
    return [Uint8Array.from(head(3, bytes.length)), bytes]
  }
  if (value instanceof Uint8Array) return [Uint8Array.from(head(2, value.length)), value]
  return null
}

function write(value: CborValue, parts: Uint8Array[]): void {
  const plain = scalar(value)
  if (plain) {
    parts.push(...plain)
    return
  }
  if (value instanceof Tagged) {
    parts.push(Uint8Array.from(head(6, value.tag)))
    write(value.value, parts)
    return
  }
  if (Array.isArray(value)) {
    parts.push(Uint8Array.from(head(4, value.length)))
    for (const item of value as readonly CborValue[]) write(item, parts)
    return
  }
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as object)
  parts.push(Uint8Array.from(head(5, entries.length)))
  for (const [key, item] of entries) {
    write(key as CborValue, parts)
    write(item as CborValue, parts)
  }
}

/** `value` as CBOR bytes. */
export function encodeCbor(value: CborValue): Uint8Array {
  const parts: Uint8Array[] = []
  write(value, parts)
  return concatBytes(parts)
}
