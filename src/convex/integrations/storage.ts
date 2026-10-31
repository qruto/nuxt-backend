import { RateLimiter } from '@convex-dev/rate-limiter'
import {
  type Auth,
  type DocumentByName,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  httpActionGeneric,
  mutationGeneric,
  queryGeneric,
  type PublicHttpAction,
  type RegisteredMutation,
  type RegisteredQuery,
  type TableNamesInDataModel,
} from 'convex/server'
import { type GenericId, v } from 'convex/values'
import { authSecrets, firstVerified, liveSecrets } from '../auth-secrets.js'
import { readEnv } from '../delivery.js'
import { backendError } from '../errors.js'
import {
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  isAcceptedType,
  isRasterImage,
  SIGNED_URL_PATH,
  SIGNED_URL_TTL_MAX_MS,
  signedUrlExpiry,
  signFileUrl,
  sniffContentType,
  STRIPPABLE_TYPES,
  UNSTRIPPABLE_TYPES,
  stripImageMetadata,
  verifyFileUrl,
} from '../files.js'
import type { Billing } from './billing.js'
import { type AdapterFindOne, createAccessReads } from './access.js'
import { DEFAULT_LIMITS } from './rate-limit.js'
import { randomToken, sha256Hex } from '../tokens.js'

// Files for the app: checked uploads kept with their owner records in the
// `backend` component's storage, their URLs shown only to who may see them,
// expiring private URLs, and share links for the app's own rows. See
// components/backend/storage.ts for the component's half.

/** Who owns a file: the account, and the workspace whose members read it. */
export interface FileOwner {
  userId: string
  /** The workspace the file belongs to: every member reads it, and it stays when the uploader leaves. Absent for a file of the account's own. */
  workspaceId?: string
}

/** What `storage.store` kept. */
export interface StoredFile {
  /** The file's id, in the `backend` component's storage: store it as `v.string()`. */
  storageId: string
  /** Its size in bytes, after stripping. */
  size: number
  /** The type read from its bytes. */
  contentType: string
}

/** A share link a public page resolved: the row, who shared it, and its preview card's image. */
export interface ResolvedShareLink {
  /** The shared row's id. */
  id: string
  /** The account that turned the link on. */
  sharedBy: string
  /** An expiring URL (seven days) of the `ogImage` file, for the page's `og:image`; `null` without one. */
  ogImageUrl: string | null
}

/** A row's share link as its page reads it. */
export interface ShareLinkState {
  /** When the link was turned on, epoch ms. */
  sharedAt: number
}

/** A link just minted: its token and the URL built from it, shown once. */
export interface MintedShareLink {
  token: string
  url: string
}

/** The functions `backend/storage.ts` re-exports. */
export interface StorageApi {
  /** A one-time upload URL into the component's storage, for a signed-in account, at the `upload` rate. */
  generateUploadUrl: RegisteredMutation<'public', Record<string, never>, Promise<string>>
  /**
   * A file's URL for its owner and the members of its workspace; `null` for anyone else, and while it
   * is checked. Typed with a storage id, as `<StorageImage :get-url>` takes it.
   */
  getFileUrl: RegisteredQuery<'public', { storageId: GenericId<'_storage'> }, Promise<string | null>>
  /** Whether a row has a live share link, and since when; `null` without one, or for a caller who may not share it. */
  getShareLink: RegisteredQuery<'public', { table: string, id: string }, Promise<ShareLinkState | null>>
  /** Turn a row's link on, replacing any earlier one: the token and the URL, shown once. */
  enableShareLink: RegisteredMutation<'public', { table: string, id: string }, Promise<MintedShareLink>>
  /** Turn a row's link off. */
  revokeShareLink: RegisteredMutation<'public', { table: string, id: string }, Promise<null>>
}

/** A context that reads: any query, mutation or action. */
export interface StorageReadCtx {
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
  auth?: Auth
}

/** A context that writes: a mutation (or an action, which is no transaction). */
export interface StorageWriteCtx extends StorageReadCtx {
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
}

/** The context `canShare` receives: the mutation's or the query's own, and the signed-in caller. */
export type ShareCtx<DM extends GenericDataModel> = (GenericQueryCtx<DM> | GenericMutationCtx<DM>) & { user: { id: string } }

/** How a table's rows are shared, for {@link Storage.shareable}. */
export interface ShareableOptions<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>> {
  /** Where the public page lives: a link reads `SITE_URL` + `path` + `/` + the token. */
  path: string
  /** Whether the signed-in caller may turn the row's link on or rotate it. */
  canShare: (ctx: ShareCtx<DM>, row: DocumentByName<DM, T>) => boolean | Promise<boolean>
  /** The storage id of the image the preview card shows, or `null` for none. */
  ogImage?: (row: DocumentByName<DM, T>) => string | null | undefined
}

/** A quota: a number, or a quota key of the billing catalog. */
export type StorageQuota = number | string

export interface SetupStorageOptions {
  /** The largest file kept, in bytes. Default 10 MB. */
  maxSize?: number
  /** The types kept, as read from the file's first bytes. Default PNG, JPEG and WebP. A wildcard (`image/*`) never admits SVG or HTML: name them to keep them. */
  accept?: readonly string[]
  /**
   * Remove EXIF, XMP and GPS data from JPEG, PNG and WebP images before they
   * are kept. Default `true`. While it is on, a wildcard such as `image/*`
   * does not admit HEIC, HEIF, AVIF or TIFF, whose metadata can't be
   * stripped, and naming one of them throws.
   */
  stripMetadata?: boolean
  /** How many files and how many bytes the billing entity (else the workspace, else the account) may keep. */
  quota?: { files?: StorageQuota, bytes?: StorageQuota }
  /** The app's billing, which a quota key needs. */
  billing?: Pick<Billing, 'requireEntity' | 'getQuota' | 'plansAllowing'>
  /** The app's rate limiter, whose `upload` limit bounds upload URLs. Default: the package's own, on `components.rateLimiter`. */
  rateLimiter?: { limit: (ctx: never, name: 'upload', options: { key: string }) => Promise<{ ok: boolean, retryAfter?: number }> }
}

/** The app's storage, from {@link setupStorage}. */
export interface Storage<DM extends GenericDataModel = GenericDataModel> {
  /**
   * Check bytes a person uploaded, strip an image's metadata, and keep them
   * with their owner record, in your mutation's transaction: a refusal
   * stores nothing. Throws `invalid_input` on `file` (too large, a type
   * `accept` does not list) and `quota_exceeded`.
   */
  store: (ctx: StorageWriteCtx, bytes: ArrayBuffer, owner: FileOwner) => Promise<StoredFile>
  /**
   * Record an upload sent to an upload URL as the owner's: its stored size
   * and the quotas now (`invalid_input` on `file`, `quota_exceeded`), the
   * type check and the stripping next, in the background. `getFileUrl`
   * reads `null` until they ran; a file of a type you do not accept is
   * deleted then.
   */
  claim: (ctx: StorageWriteCtx, storageId: string, owner: FileOwner) => Promise<{ size: number }>
  /** Delete a file with its owner record and give its bytes back to the quota. `null`, `undefined` or an unknown id does nothing. It checks no owner: pass an id read from your own row. */
  release: (ctx: StorageWriteCtx, storageId: string | null | undefined) => Promise<void>
  /**
   * Delete an upload at once while nobody claimed it: one a person sent to
   * an upload URL and then dropped, or one your check refused before the
   * claim. Never a kept file, anyone's: a claimed or stored id is left as it
   * is, and so is an id with no file. Call it from a mutation or an action,
   * as often as you like: it answers whether bytes went, `false` the second
   * time. Unclaimed uploads are swept after a day anyway; this frees them now.
   */
  discard: (ctx: StorageWriteCtx, storageId: string | null | undefined) => Promise<boolean>
  /**
   * A file's bytes in an action of yours, an upload not yet claimed
   * included: what a check reads before the upload is kept (`ai.requireSafe`
   * reads them so). `null` for an id no file has. It checks no owner: read
   * only what your code decided the caller may send.
   */
  bytes: (ctx: Pick<GenericActionCtx<GenericDataModel>, 'runAction'>, storageId: string) => Promise<Uint8Array | null>
  /** A file's URL once your query decided who may see it; `null` for a file that is gone or still checked. */
  fileUrl: (ctx: StorageReadCtx, storageId: string) => Promise<string | null>
  /** An expiring URL on the deployment's routes: `ttl` ms, an hour by default, seven days at most; `null` for a file that is gone or still checked. */
  signedUrl: (ctx: StorageReadCtx, storageId: string, options?: { ttl?: number }) => Promise<string | null>
  /** Mark a table's rows shareable by link: where the public page lives, who may share a row, and its preview card's image. */
  shareable: <T extends TableNamesInDataModel<DM>>(table: T, options: ShareableOptions<DM, T>) => void
  /** The row a token opens in a table, who shared it, and its preview card's URL; `null` for an unknown, rotated or revoked token. */
  resolveShareLink: (ctx: StorageReadCtx, table: TableNamesInDataModel<DM>, token: string) => Promise<ResolvedShareLink | null>
  /** Turn a row's link off, in the mutation that deletes the row. */
  revokeShareLink: (ctx: StorageWriteCtx, table: TableNamesInDataModel<DM>, id: string) => Promise<void>
  /** The public functions `backend/storage.ts` re-exports. */
  api: StorageApi
  /**
   * The route that serves a signed URL; `registerBackendRoutes(http, { storage })` mounts it.
   *
   * @internal
   */
  fileRoute: PublicHttpAction
}

/** The `backend` component as storage reads it, and the rate limiter it limits upload URLs with. */
export interface StorageComponents {
  backend: unknown
  rateLimiter?: unknown
}

type Limits = { files?: number, bytes?: number }
type QuotaRefusal = { quota: 'files' | 'bytes', limit: number, used: number, amount: number }
type Counters = { files?: string, bytes?: string }

interface StorageRefs {
  storage: {
    generateUploadUrl: FunctionReference<'mutation', 'internal', Record<string, never>, string>
    store: FunctionReference<'mutation', 'internal', { bytes: ArrayBuffer, contentType: string, owner: FileOwner, holder: string, limits: Limits, counters?: Counters }, { storageId: string } | { refused: QuotaRefusal } | { blocked: true }>
    bytes: FunctionReference<'action', 'internal', { storageId: string }, ArrayBuffer | null>
    claim: FunctionReference<'mutation', 'internal', { storageId: string, owner: FileOwner, holder: string, limits: Limits, maxSize: number, check: { accept: string[], strip: boolean }, counters?: Counters }, { size: number } | { invalid: 'missing' | 'claimed' | 'too_large' } | { refused: QuotaRefusal }>
    release: FunctionReference<'mutation', 'internal', { storageId: string }, boolean>
    discard: FunctionReference<'mutation', 'internal', { storageId: string }, boolean>
    url: FunctionReference<'query', 'internal', { storageId: string, userId?: string }, string | null>
    served: FunctionReference<'query', 'internal', { storageId: string }, { url: string, contentType: string, size: number } | null>
    isReady: FunctionReference<'query', 'internal', { storageId: string }, boolean>
    getShare: FunctionReference<'query', 'internal', { table: string, rowId: string }, { sharedAt: number, sharedBy: string } | null>
    enableShare: FunctionReference<'mutation', 'internal', { table: string, rowId: string, tokenHash: string, userId: string }, { sharedAt: number, sharedBy: string }>
    revokeShare: FunctionReference<'mutation', 'internal', { table: string, rowId: string }, boolean>
    resolveShare: FunctionReference<'query', 'internal', { table: string, tokenHash: string }, { rowId: string, sharedBy: string } | null>
  }
  adapter: { findOne: AdapterFindOne }
}

/** How long a preview card's URL works: seven days, minted again on each read. */
const PREVIEW_TTL_MS = SIGNED_URL_TTL_MAX_MS

/** A refusal of the file itself: `invalid_input` on `file`, with why. */
function fileRefusal(reason: 'too_large' | 'unsupported_type' | 'upload_gone' | 'upload_claimed' | 'removed_copy', detail: string) {
  return backendError('invalid_input', { field: 'file', reason }, `[nuxt-backend] ${detail}`)
}

/** The app's secrets, current first: the current one signs a file's URL, and a rotation's previous one still serves the URLs it signed. A URL is never minted or served without one. */
function urlSecrets(): string[] {
  const secrets = liveSecrets(authSecrets(readEnv('AUTH_SECRET')))
  if (secrets.length === 0) throw new Error('[nuxt-backend] AUTH_SECRET is not set, so a signed file URL cannot be signed or checked. Set it on the deployment.')
  return secrets
}

/** The secret a new file URL is signed with. */
function urlSecret(): string {
  return urlSecrets()[0]!
}

/** The deployment's HTTP origin, which serves a signed URL. */
function siteOrigin(): string {
  const site = readEnv('CONVEX_SITE_URL')
  if (!site) throw new Error('[nuxt-backend] CONVEX_SITE_URL is not set, so a signed file URL has no origin. It is set on every Convex deployment.')
  return site.replace(/\/+$/, '')
}

/** A wall clock a query may read for an expiry: the time now. */
const now = (): number => Date.now()

/** setupStorage's options with their defaults, checked: a refusal throws before any function is made. */
function checkedOptions(options: SetupStorageOptions) {
  const maxSize = options.maxSize ?? DEFAULT_MAX_FILE_SIZE
  const accept = [...(options.accept ?? DEFAULT_ACCEPTED_TYPES)].map(type => type.trim().toLowerCase())
  const strip = options.stripMetadata ?? true
  const quota = options.quota ?? {}
  const catalogQuota = typeof quota.files === 'string' || typeof quota.bytes === 'string'
  if (!Number.isFinite(maxSize) || maxSize <= 0) throw new TypeError(`[nuxt-backend] setupStorage: maxSize is a number of bytes above zero, not ${String(options.maxSize)}.`)
  if (accept.length === 0) throw new TypeError('[nuxt-backend] setupStorage: accept lists no type, so every file would be refused. Name the types to keep, such as [\'image/png\', \'image/jpeg\', \'image/webp\'].')
  const unstrippable = strip ? accept.filter(type => UNSTRIPPABLE_TYPES.has(type)) : []
  if (unstrippable.length > 0) {
    throw new TypeError(`[nuxt-backend] setupStorage: accept names ${unstrippable.join(', ')}, whose EXIF (GPS included) can't be stripped, while stripMetadata is on. Leave ${unstrippable.length > 1 ? 'them' : 'it'} out, or pass stripMetadata: false to keep such files as they are.`)
  }
  if (catalogQuota && typeof options.billing?.getQuota !== 'function') {
    throw new TypeError('[nuxt-backend] setupStorage: a quota names a key of your billing catalog, which needs `billing`: `setupStorage(components, { quota, billing })`. If you pass it, an import cycle hands it over before billing.ts finished loading.')
  }
  return { maxSize, accept, strip, quota, catalogQuota }
}

/**
 * Checked uploads, expiring private URLs and share links on Convex file
 * storage, kept in the `backend` component's storage beside one owner
 * record per file: the orphan sweep, an account's export and its erasure
 * see every file the app keeps.
 *
 * A photo goes to your mutation as bytes, and `store` checks them (size,
 * the type read from the bytes, the quotas), strips an image's EXIF, XMP
 * and GPS data, and keeps it with your row in one transaction. A large file
 * goes to an upload URL (`generateUploadUrl`, behind `useUpload` and
 * `<UploadField>`), and your mutation `claim`s it: the size and the quotas
 * at once, the type and the stripping next.
 *
 * @example
 * ```ts [backend/storage.ts]
 * import { setupStorage } from 'nuxt-backend/storage'
 * import { components } from './_generated/api'
 * import type { DataModel } from './_generated/dataModel'
 *
 * export const storage = setupStorage<DataModel>(components, {
 *   maxSize: 8 * 1024 * 1024,
 *   accept: ['image/png', 'image/jpeg', 'image/webp'],
 *   quota: { files: 200, bytes: 500 * 1024 * 1024 },
 * })
 *
 * export const { generateUploadUrl, getFileUrl } = storage.api
 * ```
 */
export function setupStorage<DM extends GenericDataModel = GenericDataModel>(components: StorageComponents, options: SetupStorageOptions = {}): Storage<DM> {
  const refs = components.backend as StorageRefs
  const reads = createAccessReads(refs.adapter.findOne)
  const { maxSize, accept, strip, quota, catalogQuota } = checkedOptions(options)
  const limiter = options.rateLimiter
    ?? (components.rateLimiter ? new RateLimiter(components.rateLimiter as ConstructorParameters<typeof RateLimiter>[0], { upload: DEFAULT_LIMITS.upload }) : null)
  const shareables = new Map<string, ShareableOptions<DM, TableNamesInDataModel<DM>>>()

  /** Whose quota a file counts against: the billing entity for a catalog quota, else the workspace, else the account. */
  async function holderOf(ctx: StorageReadCtx, owner: FileOwner): Promise<string> {
    if (catalogQuota && options.billing) return (await options.billing.requireEntity(ctx as never, { access: 'member' })).userId
    return owner.workspaceId ?? owner.userId
  }

  /** One quota's limit for a holder: the number given, or what the billing entity's plan allows of the catalog key. */
  async function limitOf(ctx: StorageReadCtx, value: StorageQuota | undefined, holder: string): Promise<number | undefined> {
    if (value === undefined) return undefined
    if (typeof value === 'number') return value
    const usage = await options.billing!.getQuota(ctx as never, value, { userId: holder })
    return usage.limit === 'unlimited' ? undefined : usage.limit
  }

  /** The billing quota keys the counts answer to, named with each write so billing's quota reads add the files to the count: only a catalog key is one. */
  const counters: Counters | undefined = catalogQuota
    ? { ...(typeof quota.files === 'string' ? { files: quota.files } : {}), ...(typeof quota.bytes === 'string' ? { bytes: quota.bytes } : {}) }
    : undefined

  async function limitsFor(ctx: StorageReadCtx, holder: string): Promise<Limits> {
    const [files, bytes] = await Promise.all([limitOf(ctx, quota.files, holder), limitOf(ctx, quota.bytes, holder)])
    return { ...(files === undefined ? {} : { files }), ...(bytes === undefined ? {} : { bytes }) }
  }

  /** A quota without room, as the refusal a page reads: the quota's key, and the plans that allow enough. */
  async function quotaRefusal(ctx: StorageReadCtx, refused: QuotaRefusal): Promise<Error> {
    const configured = quota[refused.quota]
    const key = typeof configured === 'string' ? configured : refused.quota
    const plans = typeof configured === 'string' && options.billing ? await options.billing.plansAllowing(ctx as never, configured, refused.used + refused.amount) : []
    return backendError(
      'quota_exceeded',
      { quota: key, limit: refused.limit, used: refused.used, amount: refused.amount, plans },
      `[nuxt-backend] storage: ${refused.used} of ${refused.limit} ${refused.quota === 'files' ? 'files' : 'bytes'} are used, so ${refused.amount} more do not fit.`,
    )
  }

  const store: Storage<DM>['store'] = async (ctx, bytes, owner) => {
    if (!(bytes instanceof ArrayBuffer)) throw fileRefusal('unsupported_type', 'storage.store takes the file\'s bytes, an ArrayBuffer (`v.bytes()`).')
    if (bytes.byteLength > maxSize) throw fileRefusal('too_large', `storage.store: the file is ${bytes.byteLength} bytes and maxSize is ${maxSize}.`)
    const contentType = sniffContentType(bytes)
    if (!isAcceptedType(contentType, accept, { strip })) throw fileRefusal('unsupported_type', `storage.store: the file's bytes are ${contentType ?? 'of no known type'}, which accept does not list.`)
    let kept: Uint8Array = new Uint8Array(bytes)
    if (strip && STRIPPABLE_TYPES.has(contentType)) {
      try {
        kept = stripImageMetadata(kept, contentType)
      }
      catch {
        throw fileRefusal('unsupported_type', `storage.store: the file starts like ${contentType} but its container is broken.`)
      }
    }
    const holder = await holderOf(ctx, owner)
    const body = kept.byteOffset === 0 && kept.byteLength === kept.buffer.byteLength ? kept.buffer as ArrayBuffer : kept.slice().buffer as ArrayBuffer
    const result = await ctx.runMutation(refs.storage.store, { bytes: body, contentType, owner: ownerOf(owner), holder, limits: await limitsFor(ctx, holder), ...(counters ? { counters } : {}) })
    if ('blocked' in result) throw fileRefusal('removed_copy', 'storage.store: these bytes are a copy of an image removed as shared without consent, and are never kept again.')
    if ('refused' in result) throw await quotaRefusal(ctx, result.refused)
    return { storageId: result.storageId, size: kept.byteLength, contentType }
  }

  const claim: Storage<DM>['claim'] = async (ctx, storageId, owner) => {
    const holder = await holderOf(ctx, owner)
    const result = await ctx.runMutation(refs.storage.claim, {
      storageId,
      owner: ownerOf(owner),
      holder,
      limits: await limitsFor(ctx, holder),
      maxSize,
      check: { accept, strip },
      ...(counters ? { counters } : {}),
    })
    if ('refused' in result) throw await quotaRefusal(ctx, result.refused)
    if ('invalid' in result) {
      if (result.invalid === 'too_large') throw fileRefusal('too_large', `storage.claim: the upload is over maxSize (${maxSize} bytes).`)
      if (result.invalid === 'claimed') throw fileRefusal('upload_claimed', 'storage.claim: this upload was claimed already.')
      throw fileRefusal('upload_gone', 'storage.claim: no upload has this id (it was never stored here, or the sweep deleted it).')
    }
    return { size: result.size }
  }

  const release: Storage<DM>['release'] = async (ctx, storageId) => {
    if (!storageId) return
    await ctx.runMutation(refs.storage.release, { storageId })
  }

  const discard: Storage<DM>['discard'] = async (ctx, storageId) => {
    if (!storageId) return false
    return await ctx.runMutation(refs.storage.discard, { storageId })
  }

  const bytes: Storage<DM>['bytes'] = async (ctx, storageId) => {
    if (!storageId) return null
    const read = await ctx.runAction(refs.storage.bytes, { storageId })
    return read ? new Uint8Array(read) : null
  }

  const fileUrl: Storage<DM>['fileUrl'] = async (ctx, storageId) =>
    storageId ? await ctx.runQuery(refs.storage.url, { storageId }) : null

  const signedUrl: Storage<DM>['signedUrl'] = async (ctx, storageId, { ttl } = {}) => {
    if (!storageId || !await ctx.runQuery(refs.storage.isReady, { storageId })) return null
    const expires = signedUrlExpiry(now(), ttl)
    const signature = await signFileUrl(urlSecret(), storageId, expires)
    return `${siteOrigin()}${SIGNED_URL_PATH}${encodeURIComponent(storageId)}?expires=${expires}&signature=${signature}`
  }

  const shareable: Storage<DM>['shareable'] = (table, shareOptions) => {
    if (typeof shareOptions?.canShare !== 'function') throw new TypeError(`[nuxt-backend] storage.shareable('${table}'): canShare is required, the rule for who may turn a row's link on.`)
    if (typeof shareOptions.path !== 'string' || !shareOptions.path.startsWith('/')) throw new TypeError(`[nuxt-backend] storage.shareable('${table}'): path is where the public page lives, starting with "/", such as '/s'.`)
    shareables.set(table, shareOptions as unknown as ShareableOptions<DM, TableNamesInDataModel<DM>>)
  }

  const shareableOf = (table: string): ShareableOptions<DM, TableNamesInDataModel<DM>> => {
    const found = shareables.get(table)
    if (!found) throw backendError('invalid_input', { field: 'table' }, `[nuxt-backend] '${table}' is not marked shareable: call storage.shareable('${table}', { path, canShare }) in backend/storage.ts.`)
    return found
  }

  const resolveShareLink: Storage<DM>['resolveShareLink'] = async (ctx, table, token) => {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null
    const found = shareables.get(table)
    const link = await ctx.runQuery(refs.storage.resolveShare, { table, tokenHash: await sha256Hex(token) })
    if (!link) return null
    let ogImageUrl: string | null = null
    if (found?.ogImage && 'db' in ctx) {
      const row = await rowOf(ctx as unknown as GenericQueryCtx<DM>, table, link.rowId)
      const imageId = row ? found.ogImage(row) : null
      ogImageUrl = imageId ? await signedUrl(ctx, imageId, { ttl: PREVIEW_TTL_MS }) : null
    }
    return { id: link.rowId, sharedBy: link.sharedBy, ogImageUrl }
  }

  const revokeShareLink: Storage<DM>['revokeShareLink'] = async (ctx, table, id) => {
    await ctx.runMutation(refs.storage.revokeShare, { table, rowId: id })
  }

  /** The signed-in caller, as a share or upload function takes them: refused when nobody is signed in, the account is gone, or it is banned. */
  async function requireCaller(ctx: StorageReadCtx & { auth: Auth }, what: string): Promise<string> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what} is for signed-in accounts.`)
    const account = await reads.account(ctx, identity.subject)
    if (!account) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what}: this account no longer exists.`)
    if (account.banned) throw backendError('forbidden', { reason: 'banned' }, `[nuxt-backend] ${what}: this account is banned.`)
    return identity.subject
  }

  /** May the caller share the row: what `canShare` says, given the row and the caller. */
  async function mayShare(ctx: GenericQueryCtx<DM> | GenericMutationCtx<DM>, table: string, id: string, userId: string): Promise<boolean> {
    const row = await rowOf(ctx, table, id)
    if (!row) throw backendError('invalid_input', { field: 'id' }, `[nuxt-backend] No row of '${table}' has the id ${JSON.stringify(id)}.`)
    return Boolean(await shareableOf(table).canShare({ ...ctx, user: { id: userId } } as ShareCtx<DM>, row))
  }

  const generateUploadUrl = mutationGeneric({
    args: {},
    returns: v.string(),
    handler: async (ctx) => {
      const userId = await requireCaller(ctx, 'generateUploadUrl')
      if (limiter) {
        const { ok, retryAfter } = await limiter.limit(ctx as never, 'upload', { key: userId })
        if (!ok) throw backendError('rate_limited', { limit: 'upload', ...(retryAfter === undefined ? {} : { retryAfter }) }, '[nuxt-backend] generateUploadUrl: the upload limit is spent for now.')
      }
      return ctx.runMutation(refs.storage.generateUploadUrl, {})
    },
  })

  const getFileUrl = queryGeneric({
    args: { storageId: v.string() },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, { storageId }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || !storageId) return null
      return ctx.runQuery(refs.storage.url, { storageId, userId: identity.subject })
    },
  })

  const getShareLink = queryGeneric({
    args: { table: v.string(), id: v.string() },
    returns: v.union(v.object({ sharedAt: v.number() }), v.null()),
    handler: async (ctx, { table, id }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || !shareables.has(table)) return null
      const link = await ctx.runQuery(refs.storage.getShare, { table, rowId: id })
      if (!link) return null
      if (link.sharedBy !== identity.subject && !await mayShare(ctx as GenericQueryCtx<DM>, table, id, identity.subject).catch(() => false)) return null
      return { sharedAt: link.sharedAt }
    },
  })

  const enableShareLink = mutationGeneric({
    args: { table: v.string(), id: v.string() },
    returns: v.object({ token: v.string(), url: v.string() }),
    handler: async (ctx, { table, id }) => {
      const userId = await requireCaller(ctx, 'enableShareLink')
      const { path } = shareableOf(table)
      if (!await mayShare(ctx as GenericMutationCtx<DM>, table, id, userId)) throw backendError('forbidden', { reason: 'cannot_share' }, `[nuxt-backend] enableShareLink: canShare refused this caller for this row of '${table}'.`)
      const token = randomToken()
      await ctx.runMutation(refs.storage.enableShare, { table, rowId: id, tokenHash: await sha256Hex(token), userId })
      const site = (readEnv('SITE_URL') ?? '').replace(/\/+$/, '')
      return { token, url: `${site}${path.replace(/\/+$/, '')}/${token}` }
    },
  })

  const revokeShareLinkFn = mutationGeneric({
    args: { table: v.string(), id: v.string() },
    returns: v.null(),
    handler: async (ctx, { table, id }) => {
      const userId = await requireCaller(ctx, 'revokeShareLink')
      shareableOf(table)
      const link = await ctx.runQuery(refs.storage.getShare, { table, rowId: id })
      if (!link) return null
      // The one who turned it on may always take it offline, even after the row changed.
      if (link.sharedBy !== userId && !await mayShare(ctx as GenericMutationCtx<DM>, table, id, userId)) {
        throw backendError('forbidden', { reason: 'cannot_share' }, `[nuxt-backend] revokeShareLink: canShare refused this caller for this row of '${table}'.`)
      }
      await ctx.runMutation(refs.storage.revokeShare, { table, rowId: id })
      return null
    },
  })

  const fileRoute = httpActionGeneric(async (ctx, request) => {
    const url = new URL(request.url)
    const storageId = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(SIGNED_URL_PATH) + SIGNED_URL_PATH.length))
    const expires = Number(url.searchParams.get('expires'))
    const signature = url.searchParams.get('signature') ?? ''
    const gone = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    if (!storageId || !Number.isSafeInteger(expires) || expires <= Date.now() || expires - Date.now() > SIGNED_URL_TTL_MAX_MS + 60_000) return gone()
    if (!await firstVerified(urlSecrets(), secret => verifyFileUrl(secret, storageId, expires, signature))) return gone()
    const file = await ctx.runQuery(refs.storage.served, { storageId })
    if (!file) return gone()
    // fallow-ignore-next-line security-sink -- file.url is the deployment storage URL the component read with ctx.storage.getUrl for a record it owns, never a request value; verified 2026-10-27
    const upstream = await fetch(file.url)
    if (!upstream.ok || !upstream.body) return gone()
    const image = isRasterImage(file.contentType)
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.size),
        'X-Content-Type-Options': 'nosniff',
        // Anything but a raster image downloads, and nothing it holds runs.
        'Content-Disposition': image ? 'inline' : 'attachment',
        'Content-Security-Policy': 'default-src \'none\'; img-src \'self\'; sandbox',
        'Cache-Control': `private, max-age=${Math.max(0, Math.floor((expires - Date.now()) / 1000))}`,
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    })
  })

  return {
    store,
    claim,
    release,
    discard,
    bytes,
    fileUrl,
    signedUrl,
    shareable,
    resolveShareLink,
    revokeShareLink,
    fileRoute,
    api: { generateUploadUrl, getFileUrl, getShareLink, enableShareLink, revokeShareLink: revokeShareLinkFn } as unknown as StorageApi,
  }
}

/** The owner as the component stores it: the workspace only when there is one. */
function ownerOf(owner: FileOwner): FileOwner {
  if (!owner || typeof owner.userId !== 'string' || !owner.userId) throw new TypeError('[nuxt-backend] storage: the owner names the account, `{ userId }`, and the workspace when the file is the workspace\'s, `{ userId, workspaceId }`.')
  return { userId: owner.userId, ...(owner.workspaceId ? { workspaceId: owner.workspaceId } : {}) }
}

/** A row of the app's table by its id as a string; `null` for an id of another table, or a row that is gone. */
async function rowOf<DM extends GenericDataModel>(ctx: GenericQueryCtx<DM>, table: string, id: string): Promise<DocumentByName<DM, TableNamesInDataModel<DM>> | null> {
  const normalized = ctx.db.normalizeId(table as TableNamesInDataModel<DM>, id)
  return normalized ? await ctx.db.get(table as TableNamesInDataModel<DM>, normalized) as DocumentByName<DM, TableNamesInDataModel<DM>> | null : null
}

export { DEFAULT_ACCEPTED_TYPES, DEFAULT_MAX_FILE_SIZE, SIGNED_URL_TTL_MAX_MS, SIGNED_URL_TTL_MS, sniffContentType, stripImageMetadata } from '../files.js'
