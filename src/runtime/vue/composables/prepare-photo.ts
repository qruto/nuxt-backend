import { ConvexError } from 'convex/values'
import { backendError } from '../../../convex/errors.js'

// A photo made ready in the browser before it leaves the device: decoded
// (HEIC included), turned upright by its EXIF orientation, scaled down to a
// long edge and re-encoded. Drawing it onto a canvas keeps only its pixels,
// so EXIF, GPS, XMP and every other tag stay behind. The deployment strips
// JPEG, PNG and WebP again (`setupStorage`'s `stripMetadata`), but it
// refuses HEIC, whose metadata it can't strip: this is what lets an iPhone's
// photos in, with nothing private sent in the first place.

/** The long edge a photo is sent at by default, in pixels: enough for a full-width image on a large screen, small enough to send quickly. */
const PHOTO_LONG_EDGE = 2048

/** The encoder quality a photo is sent at by default, from 0 to 1. */
const PHOTO_QUALITY = 0.85

/** The types a photo can be re-encoded as. */
export type PreparedPhotoType = 'image/jpeg' | 'image/webp' | 'image/png'

/** How {@link preparePhoto} makes a photo ready. */
export interface PreparePhotoOptions {
  /** The longest side the photo is sent at, in pixels: a larger photo is scaled down to it, a smaller one keeps its size. Default 2048. */
  longEdge?: number
  /**
   * The type it is re-encoded as. Default `'image/jpeg'`, which every model
   * and browser reads; a transparent area turns white. A browser with no
   * encoder for the type asked for (Safari has none for WebP) sends a JPEG
   * instead, never the PNG its canvas falls back to, which is several times
   * larger.
   */
  type?: PreparedPhotoType
  /** The encoder's quality for JPEG and WebP, from 0 to 1. Default 0.85. PNG ignores it. */
  quality?: number
  /** Stops the work when aborted, with the signal's reason. `useUploadField` and `useUploadQueue` hand their `prepare` one. */
  signal?: AbortSignal
}

/** Why a photo could not be made ready: not a picture (`unsupported_type`), or one this browser could not open (`unreadable`). */
export type PhotoPrepReason = 'unsupported_type' | 'unreadable'

/**
 * A photo {@link preparePhoto} could not make ready, as the refusal it is:
 * `invalid_input` on `file`, with `reason`. It is a `ConvexError` carrying
 * the catalog's data, so `getBackendError` reads it like the deployment's
 * own refusals, and `useUploadField` and `useUploadQueue` end the file as
 * refused rather than failed: another file is needed, not a retry.
 */
export class PhotoPrepError extends ConvexError<{ code: 'invalid_input', field: 'file', reason: PhotoPrepReason }> {
  /** Why: `unsupported_type` for a file that is no picture, `unreadable` for one this browser could not open. */
  readonly reason: PhotoPrepReason

  constructor(reason: PhotoPrepReason, options?: { cause?: unknown }) {
    const refusal = backendError('invalid_input', { field: 'file', reason })
    super({ code: 'invalid_input', field: 'file', reason })
    this.name = 'PhotoPrepError'
    this.message = refusal.message
    this.reason = reason
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

const HEIC_NAME = /\.(?:heic|heif)$/i

/** Whether a file is HEIC or HEIF, by its type or, when the device sends none, its name. */
function isHeic(file: Blob): boolean {
  return /^image\/hei[cf]/i.test(file.type) || HEIC_NAME.test((file as Partial<File>).name ?? '')
}

/**
 * Whether a file picked, dropped or pasted is worth preparing as a photo:
 * an image type, or a HEIC the device left untyped. A filter for a drop
 * zone; {@link preparePhoto} refuses the rest itself.
 */
export function isPhotoFile(file: Blob): boolean {
  return file.type.startsWith('image/') || isHeic(file)
}

type Drawable = ImageBitmap | HTMLImageElement

/**
 * How long a HEIC may take to open, in milliseconds, its decoder's first
 * load included, before it is refused as `unreadable`. A decoder whose
 * worker never started answers no call, and `heic-to` keeps that worker for
 * every later one: without a limit, a photo would wait forever.
 */
const HEIC_DECODE_TIMEOUT = 60_000

/**
 * The HEIC decoder, loaded the first time a HEIC arrives; never on the
 * server, which prepares no photo. `heic-to/csp` is the build that runs
 * under a content security policy without `'unsafe-eval'`: libheif compiled
 * to plain JavaScript, in a worker started from a `blob:` URL, which the
 * module lets through `worker-src` (src/nuxt/photos.ts). It stops when
 * `signal` aborts, with the signal's reason, and fails after
 * {@link HEIC_DECODE_TIMEOUT}; a bitmap that arrives after either is let go.
 */
async function decodeHeic(file: Blob, signal: AbortSignal | undefined): Promise<ImageBitmap> {
  const decoding = (async () => {
    const decoder = import.meta.server ? null : await import('heic-to/csp')
    if (!decoder) throw new PhotoPrepError('unreadable')
    return await decoder.heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } })
  })()
  return await new Promise<ImageBitmap>((resolve, reject) => {
    let settled = false
    const settle = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      done()
    }
    const onAbort = () => settle(() => reject(signal!.reason))
    const timer = setTimeout(() => settle(() => reject(new DOMException('The HEIC decoder did not answer in time.', 'TimeoutError'))), HEIC_DECODE_TIMEOUT)
    signal?.addEventListener('abort', onAbort, { once: true })
    decoding.then(
      (bitmap) => {
        if (settled) bitmap.close()
        else settle(() => resolve(bitmap))
      },
      (error: unknown) => settle(() => reject(error)),
    )
  })
}

/**
 * The file as an `<img>`, for an engine whose `createImageBitmap` can't
 * open it but whose images still honour EXIF. It loads from a `data:` URL:
 * the security headers' `img-src` allows `data:`, and refuses `blob:`.
 */
async function decodeImage(file: Blob): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = await dataUrlOf(file)
  await image.decode()
  return image
}

/** The file's bytes as a `data:` URL, of the type the file says it is. */
function dataUrlOf(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // readAsDataURL leaves a string in `result`.
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Decode a file the way this browser can: `createImageBitmap` first, turned
 * upright (Safari opens HEIC so), then a HEIC through `heic-to`, an optional
 * peer loaded only when one arrives, then an `<img>`. An abort meanwhile
 * throws the signal's reason, never a refusal.
 */
async function decode(file: Blob, signal: AbortSignal | undefined): Promise<Drawable> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    // The next decoder may open it.
  }
  try {
    if (isHeic(file)) return await decodeHeic(file, signal)
    if (typeof Image !== 'function') throw new TypeError('No image decoder in this environment')
    return await decodeImage(file)
  }
  catch (cause) {
    signal?.throwIfAborted()
    throw cause instanceof PhotoPrepError ? cause : new PhotoPrepError('unreadable', { cause })
  }
}

function sizeOf(source: Drawable): { width: number, height: number } {
  return 'naturalWidth' in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }
}

/** The size a photo is sent at: its own, or scaled down so its long edge fits. */
function fitLongEdge(width: number, height: number, edge: number): { width: number, height: number } {
  const scale = Math.min(1, edge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draw the pixels alone: a white ground under a JPEG, which has no transparency. */
function draw(context: Context2D, source: Drawable, width: number, height: number, type: PreparedPhotoType): void {
  context.imageSmoothingQuality = 'high'
  if (type === 'image/jpeg') {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(source, 0, 0, width, height)
}

/**
 * The pixels, encoded as `type`, or as a JPEG where this browser has no
 * encoder for it: a canvas asked for a type it can't write answers a PNG
 * instead (Safari does so for WebP), several times larger and likely over
 * the deployment's `maxSize`.
 */
async function encode(source: Drawable, width: number, height: number, type: PreparedPhotoType, quality: number): Promise<Blob> {
  const blob = await encodeAs(source, width, height, type, quality)
  return blob.type === type || type === 'image/jpeg' ? blob : await encodeAs(source, width, height, 'image/jpeg', quality)
}

/** The pixels, encoded: on an `OffscreenCanvas` where there is one, else on a `<canvas>`. */
async function encodeAs(source: Drawable, width: number, height: number, type: PreparedPhotoType, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context) {
      draw(context, source, width, height, type)
      return await canvas.convertToBlob({ type, quality })
    }
  }
  if (typeof document === 'undefined') throw new PhotoPrepError('unreadable')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoPrepError('unreadable')
  draw(context, source, width, height, type)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => (blob ? resolve(blob) : reject(new PhotoPrepError('unreadable'))),
    type,
    quality,
  ))
}

/** The options with their defaults, checked: a wrong one is the app's mistake, a TypeError, never a refusal of the file. */
function checked(options: PreparePhotoOptions): Required<Omit<PreparePhotoOptions, 'signal'>> {
  const longEdge = options.longEdge ?? PHOTO_LONG_EDGE
  const quality = options.quality ?? PHOTO_QUALITY
  const type = options.type ?? 'image/jpeg'
  if (!Number.isInteger(longEdge) || longEdge < 1) throw new TypeError(`[nuxt-backend] preparePhoto: longEdge is a whole number of pixels above zero, not ${String(options.longEdge)}.`)
  if (!(quality >= 0 && quality <= 1)) throw new TypeError(`[nuxt-backend] preparePhoto: quality is from 0 to 1, not ${String(options.quality)}.`)
  if (!['image/jpeg', 'image/webp', 'image/png'].includes(type)) throw new TypeError(`[nuxt-backend] preparePhoto: type is 'image/jpeg', 'image/webp' or 'image/png', not ${String(options.type)}.`)
  return { longEdge, quality, type }
}

/**
 * Make one photo ready to send, in the browser: decoded (a HEIC through
 * `heic-to` when this browser can't open it, loaded only then), turned
 * upright by its EXIF orientation, scaled down to `longEdge`, and
 * re-encoded as `type` (JPEG by default) on a canvas, which keeps the
 * pixels and drops every metadata tag, GPS included. A file that is no
 * picture, or one this browser can't open, is refused with a
 * {@link PhotoPrepError}.
 *
 * Its second argument is the options, or the abort signal alone, so it is
 * `useUploadField`'s `prepare` as it is.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const attach = useAction(api.strips.attachPhoto)
 * const field = useUploadField({
 *   prepare: preparePhoto,
 *   claim: photoId => attach({ id: props.stripId, photoId }),
 * })
 * // Or with options, in the base module's queue:
 * const queue = useUploadQueue(api.storage.generateUploadUrl, {
 *   prepare: (file, _item, signal) => preparePhoto(file, { longEdge: 1536, signal }),
 * })
 * </script>
 * ```
 */
export async function preparePhoto(file: Blob, options: PreparePhotoOptions | AbortSignal = {}): Promise<Blob> {
  const { signal, ...rest } = isSignal(options) ? { signal: options } : options
  const { longEdge, quality, type } = checked(rest)
  signal?.throwIfAborted()
  if (!isPhotoFile(file)) throw new PhotoPrepError('unsupported_type')
  const source = await decode(file, signal)
  try {
    signal?.throwIfAborted()
    const { width, height } = fitLongEdge(sizeOf(source).width, sizeOf(source).height, longEdge)
    const blob = await encode(source, width, height, type, quality)
    signal?.throwIfAborted()
    return blob
  }
  finally {
    if ('close' in source) source.close()
  }
}

function isSignal(value: unknown): value is AbortSignal {
  return typeof AbortSignal === 'function' && value instanceof AbortSignal
}
