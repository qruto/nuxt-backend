import type { FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import type { GenericId } from 'convex/values'
import { DIGITAL_SOURCE_TYPES, FORMAT_WRITERS, sniffFormat } from '../../c2pa/formats.js'
import { type CredentialsProblem, readCredentials, type SigningCredentials, writeManifest } from '../../c2pa/manifest.js'
import { logBackend } from '../../log.js'
import type { ModelCall } from './models.js'

// Content credentials on what a model made (`setupAi({ provenance })`, EU AI
// Act Art. 50): `ctx.storeImage` writes the IPTC digital source type into a
// generated image's XMP and a signed C2PA manifest beside it, and keeps it in
// the backend component's storage as its owner's, with a record of what made
// it: the quota counts it, an export lists it and an erasure deletes it, as
// it does an upload `storage.claim` kept. The manifest is written and signed
// here, in the step's own runtime, with Web Crypto (src/convex/c2pa).

/** `setupAi({ provenance })`: `true` for the defaults, or the generator name each manifest shows. */
export type ProvenanceConfig = boolean | {
  /** The generator name each manifest shows: your app's name. Default: `SITE_URL`'s host. */
  name?: string
}

/** What made a result: the models its calls went to, when it finished, and the ids of its inputs. */
export interface JobProvenance {
  models: string[]
  finishedAt: number
  /** Ids of your own rows and files it was made from, never their content. */
  inputs: string[]
}

/** A generated image, as `ctx.storeImage` takes it: the AI SDK's generated file, a `Blob`, or its bytes. */
export type GeneratedImage = Blob | Uint8Array | { uint8Array: Uint8Array, mediaType?: string }

/** What `ctx.storeImage` records beside the image. */
export interface StoreImageOptions {
  /** Ids of your own rows and files the image was made from: recorded, never read. */
  inputs?: string[]
  /**
   * The IPTC digital source type: `generated` (`trainedAlgorithmicMedia`,
   * the default) for an image a model made, `composite`
   * (`compositeWithTrainedAlgorithmicMedia`) for a photo a model edited in part.
   */
  sourceType?: 'generated' | 'composite'
}

/** `ctx.storeImage` in a job step or a metered action. */
export interface ImageStoreContext {
  /**
   * Store an image a model made, with its content credentials: the IPTC
   * source type in its XMP, a C2PA manifest signed with
   * `PROVENANCE_PRIVATE_KEY`, and a provenance record of the models, the
   * time and `inputs`. The image is kept in the `backend` component's
   * storage as the job's owner's (the run's billing entity in a metered
   * action), like an upload `storage.claim` kept: counted in the quota,
   * listed in the owner's export and deleted with it. Resolves with its id
   * there, typed as a storage id: read its URL through `storage.fileUrl`,
   * `storage.signedUrl` or `getFileUrl`, never `ctx.storage.getUrl`, and
   * delete it with `storage.release`.
   */
  storeImage: (file: GeneratedImage, options?: StoreImageOptions) => Promise<GenericId<'_storage'>>
}

type StoreArgs = { bytes: ArrayBuffer, contentType?: string, jobId?: string, owner?: string, userId?: string, models: string[], inputs: string[], sourceType: keyof typeof DIGITAL_SOURCE_TYPES, manifest?: string }

/** The backend component's provenance rows, as the AI rails reach them. */
export interface ProvenanceRefs {
  storeGeneratedImage: FunctionReference<'action', 'internal', StoreArgs, string>
  getProvenance: FunctionReference<'query', 'internal', { storageId: string }, JobProvenance | null>
  jobProvenanceInputs: FunctionReference<'query', 'internal', { jobId: string }, string[]>
}

/** The longest id `inputs` takes, and the most of them. */
const MAX_INPUT_LENGTH = 200
const MAX_INPUTS = 50

/** The generator name a manifest shows: `provenance.name`, else the app's host. */
function generatorName(config: ProvenanceConfig): string {
  if (typeof config === 'object' && config.name?.trim()) return config.name.trim()
  try {
    return new URL(process.env.SITE_URL ?? '').host || 'nuxt-backend'
  }
  catch {
    return 'nuxt-backend'
  }
}

/** The credentials, read once per isolate for each value of the two variables. */
let cached: { source: string, credentials: Promise<SigningCredentials | CredentialsProblem> } | undefined
function signingCredentials(): Promise<SigningCredentials | CredentialsProblem> {
  const key = process.env.PROVENANCE_PRIVATE_KEY
  const certificate = process.env.PROVENANCE_CERTIFICATE
  const source = `${key ?? ''}\u0000${certificate ?? ''}`
  if (cached?.source !== source) cached = { source, credentials: readCredentials(key, certificate) }
  return cached.credentials
}

const PROBLEMS: Record<CredentialsProblem, string> = {
  missing: 'PROVENANCE_PRIVATE_KEY and PROVENANCE_CERTIFICATE are not both set on the deployment',
  unreadable: 'PROVENANCE_PRIVATE_KEY is no PKCS #8 PEM key, or PROVENANCE_CERTIFICATE no PEM certificate',
  unsupported: 'PROVENANCE_PRIVATE_KEY is neither a P-256, a P-384 nor an RSA key',
  mismatch: 'PROVENANCE_PRIVATE_KEY does not match the first certificate of PROVENANCE_CERTIFICATE',
}

/** Each warning once per isolate: every image would say the same. */
const warned = new Set<string>()
function firstTime(message: string): boolean {
  if (warned.has(message)) return false
  warned.add(message)
  return true
}

function checkedInputs(inputs: unknown): string[] {
  if (inputs === undefined) return []
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS || !inputs.every(input => typeof input === 'string' && input.length > 0 && input.length <= MAX_INPUT_LENGTH)) {
    throw new TypeError(`[nuxt-backend] ctx.storeImage: \`inputs\` is a list of up to ${MAX_INPUTS} ids of your own rows and files.`)
  }
  return inputs as string[]
}

async function bytesOf(file: GeneratedImage): Promise<{ bytes: Uint8Array, declared?: string }> {
  if (file instanceof Uint8Array) return { bytes: file }
  if (file instanceof Blob) return { bytes: new Uint8Array(await file.arrayBuffer()), declared: file.type || undefined }
  if (file && file.uint8Array instanceof Uint8Array) return { bytes: file.uint8Array, declared: file.mediaType }
  throw new TypeError('[nuxt-backend] ctx.storeImage takes the file the AI SDK returned, a Blob, or its bytes.')
}

/** Who and what an image store records: its job, or its billing entity and member, and the models its run called. */
export interface ImageStoreScope {
  jobId?: string
  owner?: string
  userId?: string
  /** The calls the run made so far: the models that made the image. */
  calls: readonly ModelCall[]
  /** The model the step or action names, for a run that made no call through `ctx.model()`. */
  model?: string
}

/**
 * The image with its credentials: the source type in its XMP, and a signed
 * manifest when the deployment has a key. A format C2PA writing here does
 * not take, or a file that carries credentials of its own, is kept as it is.
 */
async function withCredentials(bytes: Uint8Array, facts: { generator: string, model?: string, sourceType: keyof typeof DIGITAL_SOURCE_TYPES }, declared: string | undefined) {
  const format = sniffFormat(bytes)
  if (!format) {
    const message = `A generated ${declared ?? 'file of an unknown type'} was stored without content credentials: JPEG, PNG and WebP carry them. Its provenance record was written.`
    if (firstTime(message)) logBackend('warn', 'ai.provenance_skipped', message)
    return { bytes, type: declared }
  }
  const writer = FORMAT_WRITERS[format]
  if (writer.hasManifest(bytes)) {
    const message = `A generated ${format} carried content credentials of its own (the model's), which were kept as they are: a second manifest would break their hash. Its provenance record was written.`
    if (firstTime(message)) logBackend('warn', 'ai.provenance_skipped', message)
    return { bytes, type: format }
  }
  const sourceType = DIGITAL_SOURCE_TYPES[facts.sourceType]
  const marked = writer.addSourceType(bytes, sourceType)
  // Credentials that cannot be read store the image unsigned, never fail its store: the model was paid for.
  const credentials = await signingCredentials().catch((): CredentialsProblem => 'unreadable')
  if (typeof credentials === 'string') {
    const message = `Generated images are stored with the IPTC source type only, no signed manifest: ${PROBLEMS[credentials]}. Run \`npx nuxt-backend env push\` to generate them.`
    if (firstTime(message)) logBackend('warn', 'ai.provenance_unsigned', message)
    return { bytes: marked, type: format }
  }
  try {
    const signed = await writeManifest(marked, format, { generator: facts.generator, model: facts.model, when: new Date(), sourceType }, credentials)
    return { bytes: signed.bytes, type: format, manifest: signed.label }
  }
  catch (error) {
    const message = 'A generated image could not be signed, and was stored with the IPTC source type only.'
    if (firstTime(message)) logBackend('warn', 'ai.provenance_unsigned', message, error)
    return { bytes: marked, type: format }
  }
}

/** `ctx.storeImage` for one run: a job step's attempt or a metered action's call. */
export function imageStore(ctx: Pick<GenericActionCtx<GenericDataModel>, 'runAction'>, config: ProvenanceConfig | undefined, rows: ProvenanceRefs, scope: ImageStoreScope): ImageStoreContext['storeImage'] {
  return async (file, options = {}) => {
    if (!config) throw new TypeError('[nuxt-backend] ctx.storeImage writes content credentials: turn them on with setupAi({ provenance: true }), or store the file with ctx.storage.store.')
    const inputs = checkedInputs(options.inputs)
    if (options.sourceType !== undefined && options.sourceType !== 'generated' && options.sourceType !== 'composite') {
      throw new TypeError('[nuxt-backend] ctx.storeImage: `sourceType` is \'generated\' or \'composite\'.')
    }
    const sourceType = options.sourceType === 'composite' ? 'compositeWithTrainedAlgorithmicMedia' : 'trainedAlgorithmicMedia'
    const { bytes, declared } = await bytesOf(file)
    const called = [...new Set(scope.calls.filter(call => call.state === 'finished').map(call => call.model))]
    const models = called.length > 0 ? called : scope.model ? [scope.model] : []
    const stored = await withCredentials(bytes, { generator: generatorName(config), model: models.at(-1), sourceType }, declared)
    // The component's action stores the bytes; only the id reaches its owner-record mutation.
    const storageId = await ctx.runAction(rows.storeGeneratedImage, {
      bytes: bufferOf(stored.bytes),
      ...(stored.type ? { contentType: stored.type } : {}),
      ...(scope.jobId ? { jobId: scope.jobId } : {}),
      ...(scope.owner ? { owner: scope.owner } : {}),
      ...(scope.userId ? { userId: scope.userId } : {}),
      models,
      inputs,
      sourceType,
      ...(stored.manifest ? { manifest: stored.manifest } : {}),
    })
    return storageId as GenericId<'_storage'>
  }
}

/** The bytes as an ArrayBuffer of their own, as a function argument takes them. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer as ArrayBuffer : bytes.slice().buffer as ArrayBuffer
}

/** `ai.provenanceOf`: what made a stored file, or `null` when nothing recorded it. */
export function provenanceReader(rows: ProvenanceRefs) {
  return (ctx: { runQuery: GenericActionCtx<GenericDataModel>['runQuery'] }, storageId: string): Promise<JobProvenance | null> =>
    ctx.runQuery(rows.getProvenance, { storageId })
}
