/**
 * Content credentials for a generated image: a C2PA 2.x manifest store with
 * one manifest — a `c2pa.actions.v2` assertion saying the image was created
 * by a trained model (the IPTC digital source type), a `c2pa.hash.data`
 * hard binding over every byte but the store's own, a `c2pa.claim.v2`
 * naming both, and a COSE_Sign1 signature of the claim with the app's key,
 * its certificate chain in the protected header.
 *
 * Pure Web Crypto and byte work, so it runs in Convex's default runtime,
 * inside the step that made the image: no Node.js action, no native code.
 * Written to the C2PA 2.x specification and checked against the Content
 * Authenticity Initiative's own reader (c2pa-rs).
 */
import { concatBytes } from '../bytes.js'
import { encodeCbor, Tagged } from './cbor.js'
import { certificatePublicKey, pemBlocks, privateKeyAlgorithm, type SigningAlgorithm } from './der.js'
import { FORMAT_WRITERS, type ImageFormat } from './formats.js'
import { cborSuperbox, JUMBF_TYPES, superbox } from './jumbf.js'

/** The key and certificate chain manifests are signed with. */
export interface SigningCredentials {
  key: CryptoKey
  algorithm: SigningAlgorithm
  /** The DER of each certificate, the signer's first. */
  chain: Uint8Array[]
}

/** Why credentials could not be read from the env: no key, or what is wrong with it. */
export type CredentialsProblem = 'missing' | 'unreadable' | 'unsupported' | 'mismatch'

/**
 * The signing credentials, from the PKCS #8 PEM key and the PEM certificate
 * chain (the signer's certificate first), or what is wrong with them. A key
 * that does not match the certificate is refused here, once, rather than
 * writing manifests no verifier accepts.
 */
export async function readCredentials(privateKey: string | undefined, certificate: string | undefined): Promise<SigningCredentials | CredentialsProblem> {
  if (!privateKey?.trim() || !certificate?.trim()) return 'missing'
  let pkcs8: Uint8Array | undefined
  let chain: Uint8Array[]
  let algorithm: SigningAlgorithm | null
  let publicKey: ReturnType<typeof certificatePublicKey>
  try {
    // A PEM body that is no base64 (a stray quote, a base64url `-`) is as unreadable as no PEM at all.
    ;[pkcs8] = pemBlocks(privateKey, 'PRIVATE KEY')
    chain = pemBlocks(certificate, 'CERTIFICATE')
    if (!pkcs8 || chain.length === 0) return 'unreadable'
    algorithm = privateKeyAlgorithm(pkcs8)
    publicKey = certificatePublicKey(chain[0]!)
  }
  catch {
    return 'unreadable'
  }
  if (!algorithm) return 'unsupported'
  if (publicKey.algorithm?.name !== algorithm.name) return 'mismatch'
  try {
    const key = await crypto.subtle.importKey('pkcs8', source(pkcs8), algorithm.importParams, false, ['sign'])
    const verifier = await crypto.subtle.importKey('spki', source(publicKey.spki), algorithm.importParams, false, ['verify'])
    const probe = new TextEncoder().encode('nuxt-backend content credentials')
    const signature = await crypto.subtle.sign(algorithm.signParams, key, probe)
    if (!await crypto.subtle.verify(algorithm.signParams, verifier, signature, probe)) return 'mismatch'
    return { key, algorithm, chain }
  }
  catch {
    return 'unreadable'
  }
}

/** What the manifest says about the image. */
export interface ManifestFacts {
  /** The claim generator: the app's name (`setupAi({ provenance: { name } })`). */
  generator: string
  /** The model that made the image: the action's software agent. */
  model?: string
  /** When it was made. */
  when: Date
  /** The IPTC digital source type's URI. */
  sourceType: string
}

const SHA256_LENGTH = 32

/** Bytes as Web Crypto takes them: every array here sits on a plain ArrayBuffer. */
const source = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', source(bytes)))
}

/** A hashed URI: a JUMBF URI, and the hash of the box it names. */
function hashedUri(url: string, hash: Uint8Array) {
  return { url, alg: 'sha256', hash }
}

/** The hash a hashed URI holds for a superbox: over its description and content boxes, its own header left out. */
const boxHash = (superboxBytes: Uint8Array) => sha256(superboxBytes.subarray(8))

/** A random UUID for the manifest's label and the instance id. */
const uuid = (): string => crypto.randomUUID()

/** The parts of the store whose bytes do not depend on the hashes. */
interface Draft {
  label: string
  instanceId: string
  actions: Uint8Array
}

function actionsAssertion(facts: ManifestFacts): Uint8Array {
  const action: Record<string, unknown> = {
    action: 'c2pa.created',
    digitalSourceType: facts.sourceType,
    when: facts.when.toISOString(),
  }
  if (facts.model) action.softwareAgent = { name: facts.model }
  return cborSuperbox(JUMBF_TYPES.cbor, 'c2pa.actions.v2', encodeCbor({ actions: [action as never] }))
}

function dataHashAssertion(exclusion: { start: number, length: number }, hash: Uint8Array, pad: number): Uint8Array {
  return cborSuperbox(JUMBF_TYPES.cbor, 'c2pa.hash.data', encodeCbor({
    exclusions: [{ start: exclusion.start, length: exclusion.length }],
    name: 'jumbf manifest',
    alg: 'sha256',
    hash,
    pad: new Uint8Array(pad),
  }))
}

/** The manifest store, every part in place: its size never depends on the hash or signature values, only their lengths. */
async function assemble(draft: Draft, facts: ManifestFacts, credentials: SigningCredentials, dataHash: Uint8Array, sign: (claim: Uint8Array) => Promise<Uint8Array>) {
  const assertionsStore = superbox(JUMBF_TYPES.assertions, 'c2pa.assertions', [draft.actions, dataHash])
  const claim = encodeCbor({
    instanceID: draft.instanceId,
    claim_generator_info: { name: facts.generator },
    signature: `self#jumbf=/c2pa/${draft.label}/c2pa.signature`,
    created_assertions: [
      hashedUri('self#jumbf=c2pa.assertions/c2pa.actions.v2', await boxHash(draft.actions)),
      hashedUri('self#jumbf=c2pa.assertions/c2pa.hash.data', await boxHash(dataHash)),
    ],
    alg: 'sha256',
  })
  const signature = await coseSign1(claim, credentials, sign)
  const manifest = superbox(JUMBF_TYPES.manifest, draft.label, [
    assertionsStore,
    cborSuperbox(JUMBF_TYPES.claim, 'c2pa.claim.v2', claim),
    cborSuperbox(JUMBF_TYPES.signature, 'c2pa.signature', signature),
  ])
  return superbox(JUMBF_TYPES.store, 'c2pa', [manifest])
}

/** COSE_Sign1 (tag 18) over the claim, detached: the claim is the payload, the chain in the protected header. */
async function coseSign1(claim: Uint8Array, { algorithm, chain }: SigningCredentials, sign: (toSign: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const protectedHeader = encodeCbor(new Map<number, never>([
    [1, algorithm.cose as never],
    [33, (chain.length === 1 ? chain[0]! : chain) as never],
  ]))
  const toSign = encodeCbor(['Signature1', protectedHeader, new Uint8Array(0), claim])
  const signature = await sign(toSign)
  return encodeCbor(new Tagged(18, [protectedHeader, {}, null, signature]))
}

/**
 * The image with its content credentials written in: `bytes` (already
 * carrying its XMP) and a signed manifest store placed where its format
 * keeps one, the data hash covering every other byte.
 */
export async function writeManifest(bytes: Uint8Array, format: ImageFormat, facts: ManifestFacts, credentials: SigningCredentials): Promise<{ bytes: Uint8Array, label: string }> {
  const writer = FORMAT_WRITERS[format]
  const label = `urn:c2pa:${uuid()}`
  const draft: Draft = { label, instanceId: `xmp:iid:${uuid()}`, actions: actionsAssertion(facts) }
  const signatureLength = (await crypto.subtle.sign(credentials.algorithm.signParams, credentials.key, new Uint8Array(1))).byteLength
  const placeholder = async () => new Uint8Array(signatureLength)
  const zeros = new Uint8Array(SHA256_LENGTH)

  // The exclusion names the container's length, which depends on how the
  // exclusion's own numbers encode: settle it before any hash is taken.
  const start = writer.insertStore(bytes, new Uint8Array(0)).start
  let length = 0
  let pad = 0
  for (let pass = 0; ; pass++) {
    const store = await assemble(draft, facts, credentials, dataHashAssertion({ start, length }, zeros, pad), placeholder)
    const placed = writer.insertStore(bytes, store)
    if (placed.length === length) break
    // A length that would flip back and forth between encodings is held with padding.
    if (pass >= 4) pad += 1
    length = placed.length
  }

  const unhashed = writer.insertStore(bytes, await assemble(draft, facts, credentials, dataHashAssertion({ start, length }, zeros, pad), placeholder)).bytes
  const hash = await sha256(concatBytes([unhashed.subarray(0, start), unhashed.subarray(start + length)]))
  const store = await assemble(draft, facts, credentials, dataHashAssertion({ start, length }, hash, pad), async toSign =>
    new Uint8Array(await crypto.subtle.sign(credentials.algorithm.signParams, credentials.key, source(toSign))))
  const placed = writer.insertStore(bytes, store)
  if (placed.length !== length) throw new Error('C2PA: the manifest store changed size between its passes.')
  return { bytes: placed.bytes, label }
}
