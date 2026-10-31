/**
 * What the signer reads of its PEM inputs: the DER of each block, the key's
 * algorithm from its PKCS #8 header, and a certificate's public key — a
 * minimal DER reader, enough to walk to those fields and no further.
 */

/** A DER element: its tag, where it starts (its header), and where its content starts and ends. */
interface Element {
  tag: number
  at: number
  start: number
  end: number
}

function element(der: Uint8Array, at: number): Element {
  const tag = der[at]!
  let length = der[at + 1]!
  let start = at + 2
  if (length & 0x80) {
    const bytes = length & 0x7F
    length = 0
    for (let i = 0; i < bytes; i++) length = length * 256 + der[start + i]!
    start += bytes
  }
  if (start + length > der.length) throw new TypeError('DER: an element runs past the end.')
  return { tag, at, start, end: start + length }
}

/** The elements of a constructed element, in order. */
function children(der: Uint8Array, parent: Element): Element[] {
  const out: Element[] = []
  for (let at = parent.start; at < parent.end;) {
    const child = element(der, at)
    out.push(child)
    at = child.end
  }
  return out
}

/** An OBJECT IDENTIFIER's dotted form. */
function oid(der: Uint8Array, item: Element): string {
  const bytes = der.subarray(item.start, item.end)
  const parts = [Math.floor(bytes[0]! / 40), bytes[0]! % 40]
  let value = 0
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7F)
    if (!(byte & 0x80)) {
      parts.push(value)
      value = 0
    }
  }
  return parts.join('.')
}

/** The DER of every PEM block of `label` in `text`, in order. Escaped line ends (`\n`), as a one-line env value has, are read as line ends. */
export function pemBlocks(text: string, label: string): Uint8Array[] {
  // fallow-ignore-next-line security-sink -- every caller passes a literal PEM label (CERTIFICATE, PRIVATE KEY), never input, and the pattern is linear; verified 2026-10-28
  const pattern = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`, 'g')
  return [...text.replace(/\\n/g, '\n').matchAll(pattern)].map(([, body]) => base64Bytes(body!.replace(/\s+/g, '')))
}

function base64Bytes(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

/** A signing algorithm, as COSE names it and Web Crypto runs it. */
export interface SigningAlgorithm {
  /** The COSE algorithm id: ES256 -7, ES384 -35, PS256 -37. */
  cose: number
  name: 'ES256' | 'ES384' | 'PS256'
  importParams: EcKeyImportParams | RsaHashedImportParams
  signParams: EcdsaParams | RsaPssParams
}

const EC_PUBLIC_KEY = '1.2.840.10045.2.1'
const RSA_ENCRYPTION = '1.2.840.113549.1.1.1'
const CURVES: Record<string, SigningAlgorithm> = {
  '1.2.840.10045.3.1.7': { cose: -7, name: 'ES256', importParams: { name: 'ECDSA', namedCurve: 'P-256' }, signParams: { name: 'ECDSA', hash: 'SHA-256' } },
  '1.3.132.0.34': { cose: -35, name: 'ES384', importParams: { name: 'ECDSA', namedCurve: 'P-384' }, signParams: { name: 'ECDSA', hash: 'SHA-384' } },
}
const PS256: SigningAlgorithm = { cose: -37, name: 'PS256', importParams: { name: 'RSA-PSS', hash: 'SHA-256' }, signParams: { name: 'RSA-PSS', saltLength: 32 } }

/** The algorithm a key in an AlgorithmIdentifier (PKCS #8 or SubjectPublicKeyInfo) signs with, or null for one C2PA signing here does not take. */
function algorithmOf(der: Uint8Array, identifier: Element): SigningAlgorithm | null {
  const [algorithm, parameters] = children(der, identifier)
  if (!algorithm) return null
  const id = oid(der, algorithm)
  if (id === RSA_ENCRYPTION) return PS256
  if (id === EC_PUBLIC_KEY && parameters?.tag === 0x06) return CURVES[oid(der, parameters)] ?? null
  return null
}

/** The algorithm a PKCS #8 private key signs with: P-256 and P-384 keys, and RSA keys (PS256). */
export function privateKeyAlgorithm(pkcs8: Uint8Array): SigningAlgorithm | null {
  const [, identifier] = children(pkcs8, element(pkcs8, 0))
  return identifier ? algorithmOf(pkcs8, identifier) : null
}

/** A certificate's SubjectPublicKeyInfo, whole, with the algorithm it names. */
export function certificatePublicKey(certificate: Uint8Array): { spki: Uint8Array, algorithm: SigningAlgorithm | null } {
  const [tbs] = children(certificate, element(certificate, 0))
  const fields = children(certificate, tbs!)
  // version [0] is explicit and optional: the key is the sixth field after it.
  const spki = fields[fields[0]!.tag === 0xA0 ? 6 : 5]!
  const [identifier] = children(certificate, spki)
  return { spki: certificate.slice(spki.at, spki.end), algorithm: algorithmOf(certificate, identifier!) }
}
