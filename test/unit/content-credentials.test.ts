import { createHash, verify, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DIGITAL_SOURCE_TYPES, FORMAT_WRITERS, sniffFormat, type ImageFormat } from '../../src/convex/c2pa/formats'
import { readCredentials, writeManifest, type SigningCredentials } from '../../src/convex/c2pa/manifest'
import { envLine, generateProvenanceCredentials } from '../../src/provenance-keys'

// Content credentials as `ctx.storeImage` writes them (src/convex/c2pa): the
// IPTC source type in the XMP, and a C2PA 2.x manifest store whose data hash
// covers every byte but its own and whose COSE signature verifies against
// the certificate it carries. The structure was checked against the Content
// Authenticity Initiative's reader (c2pa-rs, through @contentauth/c2pa-node)
// for every format here: signature validated, hashes matched, the signer
// untrusted until its root is a trust anchor, and trusted once it is. This
// test holds the same properties without the native reader.

const IMAGES: Record<string, { format: ImageFormat, base64: string }> = {
  'a JPEG': { format: 'image/jpeg', base64: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=' },
  'a PNG': { format: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
  'a lossy WebP': { format: 'image/webp', base64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=' },
  'a lossless WebP': { format: 'image/webp', base64: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==' },
}

const bytesOf = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'))

// ── A minimal CBOR and JUMBF reader, enough to check what was written ───────

type Cbor = number | string | boolean | null | Uint8Array | Cbor[] | Map<Cbor, Cbor> | { tag: number, value: Cbor }

function decodeCbor(bytes: Uint8Array): Cbor {
  let at = 0
  const argument = (info: number): number => {
    if (info < 24) return info
    const size = 1 << (info - 24)
    let value = 0
    for (let i = 0; i < size; i++) value = value * 256 + bytes[at++]!
    return value
  }
  const read = (): Cbor => {
    const initial = bytes[at++]!
    const major = initial >> 5
    const info = initial & 0x1F
    if (major === 7) return info === 20 ? false : info === 21 ? true : null
    const value = argument(info)
    switch (major) {
      case 0: return value
      case 1: return -1 - value
      case 2: return bytes.slice(at, (at += value))
      case 3: return new TextDecoder().decode(bytes.slice(at, (at += value)))
      case 4: return Array.from({ length: value }, read)
      case 5: return new Map(Array.from({ length: value }, () => [read(), read()] as [Cbor, Cbor]))
      default: return { tag: value, value: read() }
    }
  }
  return read()
}

interface Box {
  type: string
  label?: string
  /** The bytes after the 8-byte header. */
  payload: Uint8Array
  children: Box[]
}

function readBoxes(bytes: Uint8Array): Box[] {
  const boxes: Box[] = []
  for (let at = 0; at < bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + at).getUint32(0)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const payload = bytes.subarray(at + 8, at + length)
    const box: Box = { type, payload, children: [] }
    if (type === 'jumb') {
      box.children = readBoxes(payload)
      const description = box.children[0]!.payload
      const end = description.indexOf(0, 17)
      box.label = new TextDecoder().decode(description.subarray(17, end))
    }
    boxes.push(box)
    at += length
  }
  return boxes
}

const child = (box: Box, label: string): Box => box.children.find(entry => entry.label === label)!
const cborOf = (box: Box) => decodeCbor(box.children[1]!.payload) as Map<Cbor, Cbor>

let credentials: SigningCredentials
let certificatePem: string
async function signer(): Promise<SigningCredentials> {
  if (credentials) return credentials
  const generated = generateProvenanceCredentials('Panels')
  certificatePem = generated.certificate
  const read = await readCredentials(generated.privateKey, generated.certificate)
  if (typeof read === 'string') throw new Error(read)
  credentials = read
  return credentials
}

/** The store and the range it was placed at, found by the exclusion the data hash names. */
function storeOf(file: Uint8Array, format: ImageFormat): { store: Box, start: number, length: number } {
  const marker = format === 'image/png' ? 'caBX' : format === 'image/webp' ? 'C2PA' : 'JP'
  const text = Buffer.from(file).toString('latin1')
  if (format === 'image/jpeg') {
    const start = text.indexOf('\xFF\xEB')
    const length = (file[start + 2]! << 8 | file[start + 3]!) + 2
    // One segment holds the whole store here: past its CI, En and Z.
    return { store: readBoxes(file.subarray(start + 12, start + length))[0]!, start, length }
  }
  const start = text.indexOf(marker) - (format === 'image/png' ? 4 : 0)
  const length = new DataView(file.buffer, file.byteOffset + start + (format === 'image/png' ? 0 : 4)).getUint32(0, format === 'image/webp')
  const data = file.subarray(start + 8, start + 8 + length)
  return { store: readBoxes(data)[0]!, start, length: 8 + length + (format === 'image/png' ? 4 : 0) }
}

describe('content credentials in a generated image', () => {
  it.each(Object.entries(IMAGES))('%s: the source type in its XMP, a signed manifest, and a hash over every other byte', async (_name, { format, base64 }) => {
    const original = bytesOf(base64)
    expect(sniffFormat(original)).toBe(format)
    const writer = FORMAT_WRITERS[format]
    const marked = writer.addSourceType(original, DIGITAL_SOURCE_TYPES.trainedAlgorithmicMedia)
    expect(Buffer.from(marked).toString('latin1')).toContain('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"')
    expect(writer.hasManifest(marked)).toBe(false)

    const when = new Date('2026-10-25T12:00:00Z')
    const { bytes, label } = await writeManifest(marked, format, { generator: 'Panels', model: 'google/gemini-3.1-flash-image-preview', when, sourceType: DIGITAL_SOURCE_TYPES.trainedAlgorithmicMedia }, await signer())
    expect(writer.hasManifest(bytes)).toBe(true)
    expect(label).toMatch(/^urn:c2pa:[0-9a-f-]{36}$/)

    const { store, start, length } = storeOf(bytes, format)
    expect(store.label).toBe('c2pa')
    const manifest = child(store, label)
    const assertions = child(manifest, 'c2pa.assertions')

    // The action: created by a trained model, by the model, when.
    const actions = cborOf(child(assertions, 'c2pa.actions.v2')).get('actions') as Array<Map<Cbor, Cbor>>
    expect(actions[0]!.get('action')).toBe('c2pa.created')
    expect(actions[0]!.get('digitalSourceType')).toBe(DIGITAL_SOURCE_TYPES.trainedAlgorithmicMedia)
    expect((actions[0]!.get('softwareAgent') as Map<Cbor, Cbor>).get('name')).toBe('google/gemini-3.1-flash-image-preview')
    expect(actions[0]!.get('when')).toBe(when.toISOString())

    // The hard binding: its exclusion is exactly the store's container, and its hash every other byte.
    const dataHash = cborOf(child(assertions, 'c2pa.hash.data'))
    const [exclusion] = dataHash.get('exclusions') as Array<Map<Cbor, Cbor>>
    expect({ start: exclusion!.get('start'), length: exclusion!.get('length') }).toEqual({ start, length })
    const rest = Buffer.concat([bytes.subarray(0, start), bytes.subarray(start + length)])
    expect(Buffer.from(dataHash.get('hash') as Uint8Array)).toEqual(createHash('sha256').update(rest).digest())

    // The claim names both assertions by the hash of their boxes, and the generator.
    const claimBox = child(manifest, 'c2pa.claim.v2')
    const claim = cborOf(claimBox)
    expect((claim.get('claim_generator_info') as Map<Cbor, Cbor>).get('name')).toBe('Panels')
    for (const uri of claim.get('created_assertions') as Array<Map<Cbor, Cbor>>) {
      const name = (uri.get('url') as string).split('/').pop()!
      const box = child(assertions, name)
      expect(Buffer.from(uri.get('hash') as Uint8Array)).toEqual(createHash('sha256').update(box.payload).digest())
    }

    // The signature: COSE_Sign1 over the claim, the chain in its protected header, verifying with the signer's key.
    const cose = decodeCbor(child(manifest, 'c2pa.signature').children[1]!.payload) as { tag: number, value: Cbor[] }
    expect(cose.tag).toBe(18)
    const [protectedHeader, , payload, signature] = cose.value as [Uint8Array, unknown, null, Uint8Array]
    expect(payload).toBeNull()
    const header = decodeCbor(protectedHeader) as Map<Cbor, Cbor>
    expect(header.get(1)).toBe(-7)
    const chain = header.get(33) as Uint8Array[]
    expect(chain).toHaveLength(2)
    const toSign = Buffer.from(encodeSigStructure(protectedHeader, claimBox.children[1]!.payload))
    expect(verify('sha256', toSign, { key: new X509Certificate(Buffer.from(chain[0]!)).publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature))).toBe(true)
  })

  it('keeps the XMP of an image that names its source type already, and says when credentials are there', () => {
    const png = bytesOf(IMAGES['a PNG']!.base64)
    const once = FORMAT_WRITERS['image/png'].addSourceType(png, DIGITAL_SOURCE_TYPES.trainedAlgorithmicMedia)
    expect(FORMAT_WRITERS['image/png'].addSourceType(once, DIGITAL_SOURCE_TYPES.compositeWithTrainedAlgorithmicMedia)).toBe(once)
    expect(sniffFormat(new TextEncoder().encode('GIF89a'))).toBeNull()
  })

  it('writes the composite source type for a photo a model edited in part', async () => {
    const jpeg = bytesOf(IMAGES['a JPEG']!.base64)
    const marked = FORMAT_WRITERS['image/jpeg'].addSourceType(jpeg, DIGITAL_SOURCE_TYPES.compositeWithTrainedAlgorithmicMedia)
    expect(Buffer.from(marked).toString('latin1')).toContain('compositeWithTrainedAlgorithmicMedia')
  })
})

/** COSE's Sig_structure for a detached COSE_Sign1, as the signer built it. */
function encodeSigStructure(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array {
  const head = (major: number, length: number) => length < 24 ? [major << 5 | length] : length < 256 ? [major << 5 | 24, length] : [major << 5 | 25, length >> 8, length & 0xFF]
  const text = new TextEncoder().encode('Signature1')
  return Uint8Array.from([...head(4, 4), ...head(3, text.length), ...text, ...head(2, protectedHeader.length), ...protectedHeader, ...head(2, 0), ...head(2, payload.length), ...payload])
}

describe('the signing key and certificate', () => {
  it('generates a P-256 key and a chain C2PA accepts: a signer for document signing, issued by a root of its own', async () => {
    await signer()
    const [signerPem, rootPem] = certificatePem.split(/(?<=-----END CERTIFICATE-----\n)/)
    const leaf = new X509Certificate(signerPem!)
    const root = new X509Certificate(rootPem!)
    expect(leaf.subject).toContain('CN=Panels content credentials')
    expect(leaf.issuer).toBe(root.subject)
    expect(leaf.checkIssued(root)).toBe(true)
    expect(leaf.verify(root.publicKey)).toBe(true)
    expect(leaf.ca).toBe(false)
    expect(root.ca).toBe(true)
    expect(leaf.keyUsage).toEqual(expect.arrayContaining(['1.3.6.1.5.5.7.3.36', '1.3.6.1.5.5.7.3.4']))
    expect(new Date(leaf.validTo).getTime()).toBeGreaterThan(Date.now() + 9 * 365 * 24 * 60 * 60 * 1000)
  })

  it('reads the pair from one-line env values, and refuses one that is missing, unreadable or mismatched', async () => {
    const pair = generateProvenanceCredentials('Panels')
    const other = generateProvenanceCredentials('Other')
    const oneLine = (line: string) => line.slice(line.indexOf('"') + 1, -1)
    const key = oneLine(envLine('PROVENANCE_PRIVATE_KEY', pair.privateKey))
    const certificate = oneLine(envLine('PROVENANCE_CERTIFICATE', pair.certificate))
    expect(key).not.toContain('\n')
    expect(typeof await readCredentials(key, certificate)).toBe('object')
    expect(await readCredentials(undefined, certificate)).toBe('missing')
    expect(await readCredentials('not a key', certificate)).toBe('unreadable')
    // A stray character in a PEM body is no base64: unreadable, never a throw.
    expect(await readCredentials(key.replace('-----\\n', '-----\\n"'), certificate)).toBe('unreadable')
    expect(await readCredentials(key, certificate.replace('-----\\n', '-----\\n-'))).toBe('unreadable')
    expect(await readCredentials(other.privateKey, pair.certificate)).toBe('mismatch')
  })
})
