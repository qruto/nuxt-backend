/**
 * The signing key and certificate `env push` generates for content
 * credentials (`setupAi({ provenance })`) when an app has none: a P-256 key,
 * and a chain of two certificates made here — the signer's, issued by a
 * root made for it whose key is thrown away at once.
 *
 * C2PA readers refuse a self-signed signer certificate, so the signer is
 * issued by a root of its own: the profile checks pass (key usage, the
 * document-signing extended key usage, key identifiers), and verifiers show
 * the signer as unknown, since the root is on no trust list. A certificate
 * from a CA on the C2PA trust list replaces both.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

// ── DER ─────────────────────────────────────────────────────────────────────

function tlv(tag: number, content: Uint8Array): Buffer {
  const length = content.length
  const head = length < 0x80
    ? [length]
    : (() => {
        const bytes: number[] = []
        for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest & 0xFF)
        return [0x80 | bytes.length, ...bytes]
      })()
  return Buffer.concat([Buffer.from([tag, ...head]), content])
}

const sequence = (...items: Uint8Array[]) => tlv(0x30, Buffer.concat(items))
const set = (...items: Uint8Array[]) => tlv(0x31, Buffer.concat(items))
const octets = (bytes: Uint8Array) => tlv(0x04, bytes)
const utf8 = (text: string) => tlv(0x0C, Buffer.from(text, 'utf8'))
const bool = (value: boolean) => tlv(0x01, Buffer.from([value ? 0xFF : 0x00]))
const explicit = (tag: number, content: Uint8Array) => tlv(0xA0 | tag, content)

/** A non-negative INTEGER from its big-endian bytes, a zero byte ahead of a high bit. */
function integer(bytes: Uint8Array): Buffer {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  const trimmed = Buffer.from(bytes.subarray(start))
  return tlv(0x02, trimmed[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed)
}

/** A BIT STRING of whole bytes, or of `bits` with the unused low bits said. */
function bitString(bytes: Uint8Array, unused = 0): Buffer {
  return tlv(0x03, Buffer.concat([Buffer.from([unused]), bytes]))
}

function oid(dotted: string): Buffer {
  const [first, second, ...rest] = dotted.split('.').map(Number)
  const out = [first! * 40 + second!]
  for (const part of rest) {
    const groups: number[] = []
    for (let value = part; ; value = Math.floor(value / 128)) {
      groups.unshift(value & 0x7F)
      if (value < 128) break
    }
    out.push(...groups.map((group, i) => (i < groups.length - 1 ? group | 0x80 : group)))
  }
  return tlv(0x06, Buffer.from(out))
}

/** UTCTime through 2049, GeneralizedTime after, as RFC 5280 asks. */
function time(date: Date): Buffer {
  const iso = date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return date.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`)) : tlv(0x18, Buffer.from(`${iso}Z`))
}

// ── X.509 ───────────────────────────────────────────────────────────────────

const ECDSA_WITH_SHA256 = sequence(oid('1.2.840.10045.4.3.2'))
const EMAIL_PROTECTION = '1.3.6.1.5.5.7.3.4'
const DOCUMENT_SIGNING = '1.3.6.1.5.5.7.3.36'

function name(commonName: string, organization: string): Buffer {
  return sequence(
    set(sequence(oid('2.5.4.10'), utf8(organization))),
    set(sequence(oid('2.5.4.3'), utf8(commonName))),
  )
}

function extension(id: string, critical: boolean, value: Uint8Array): Buffer {
  return critical ? sequence(oid(id), bool(true), octets(value)) : sequence(oid(id), octets(value))
}

/** The key identifier of a public key: the SHA-1 of its key bits (RFC 5280 4.2.1.2, method 1). */
function keyIdentifier(publicKey: KeyObject): Buffer {
  const spki = publicKey.export({ type: 'spki', format: 'der' })
  // The key bits are the BIT STRING at the end, past its unused-bits byte; for a P-256 key, its last 65 bytes.
  // fallow-ignore-next-line security-sink -- SHA-1 of the key bits is the key identifier RFC 5280 4.2.1.2 method 1 defines, an id and not a security property; the algorithm is a literal; verified 2026-10-28
  return createHash('sha1').update(spki.subarray(spki.length - 65)).digest()
}

interface Issue {
  subject: Buffer
  issuer: Buffer
  publicKey: KeyObject
  issuerKey: KeyObject
  issuerPublicKey: KeyObject
  notAfter: Date
  extensions: Buffer[]
}

function certificate({ subject, issuer, publicKey, issuerKey, issuerPublicKey, notAfter, extensions }: Issue): Buffer {
  const serial = randomBytes(16)
  serial[0] = serial[0]! & 0x7F
  const tbs = sequence(
    explicit(0, integer(Buffer.from([2]))),
    integer(serial),
    ECDSA_WITH_SHA256,
    issuer,
    sequence(time(new Date(Date.now() - 60 * 60 * 1000)), time(notAfter)),
    subject,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, sequence(
      ...extensions,
      extension('2.5.29.14', false, octets(keyIdentifier(publicKey))),
      extension('2.5.29.35', false, sequence(tlv(0x80, keyIdentifier(issuerPublicKey)))),
    )),
  )
  return sequence(tbs, ECDSA_WITH_SHA256, bitString(sign('sha256', tbs, issuerKey)))
}

function pem(label: string, der: Uint8Array): string {
  const base64 = Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`
}

const years = (count: number) => new Date(Date.now() + count * 365.25 * 24 * 60 * 60 * 1000)

/** A generated signing key and certificate chain, as PEM text. */
export interface ProvenanceCredentials {
  /** `PROVENANCE_PRIVATE_KEY`: the signer's PKCS #8 key. */
  privateKey: string
  /** `PROVENANCE_CERTIFICATE`: the signer's certificate, then the root that issued it. */
  certificate: string
}

/**
 * A new signing key, its certificate (ten years) and the root that issued
 * it (twenty), for `organization`, the name verifiers show as the signer's.
 */
export function generateProvenanceCredentials(organization: string): ProvenanceCredentials {
  const root = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const signer = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const rootName = name(`${organization} content credentials root`, organization)
  const rootCertificate = certificate({
    subject: rootName,
    issuer: rootName,
    publicKey: root.publicKey,
    issuerKey: root.privateKey,
    issuerPublicKey: root.publicKey,
    notAfter: years(20),
    extensions: [
      extension('2.5.29.19', true, sequence(bool(true), integer(Buffer.from([0])))),
      // keyCertSign and cRLSign: bits 5 and 6.
      extension('2.5.29.15', true, bitString(Buffer.from([0x06]), 1)),
    ],
  })
  const signerCertificate = certificate({
    subject: name(`${organization} content credentials`, organization),
    issuer: rootName,
    publicKey: signer.publicKey,
    issuerKey: root.privateKey,
    issuerPublicKey: root.publicKey,
    notAfter: years(10),
    extensions: [
      extension('2.5.29.19', true, sequence()),
      // digitalSignature: bit 0.
      extension('2.5.29.15', true, bitString(Buffer.from([0x80]), 7)),
      extension('2.5.29.37', false, sequence(oid(EMAIL_PROTECTION), oid(DOCUMENT_SIGNING))),
    ],
  })
  return {
    privateKey: signer.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificate: pem('CERTIFICATE', signerCertificate) + pem('CERTIFICATE', rootCertificate),
  }
}

/** A PEM value as one `.env` line: its line ends escaped, the way dotenv reads them back in double quotes. */
export function envLine(name: string, value: string): string {
  return `${name}="${value.trim().replace(/\n/g, '\\n')}"`
}
