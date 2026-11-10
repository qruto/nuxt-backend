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

/** Why a photo could not be made ready: not a photo (`unsupported_type`), one too large to open here (`too_large`), or one this browser could not open (`unreadable`). */
export type PhotoPrepReason = 'unsupported_type' | 'too_large' | 'unreadable'

/**
 * A photo {@link preparePhoto} could not make ready, as the refusal it is:
 * `invalid_input` on `file`, with `reason`. It is a `ConvexError` carrying
 * the catalog's data, so `getBackendError` reads it like the deployment's
 * own refusals, and `useUploadField` and `useUploadQueue` end the file as
 * refused rather than failed: another file is needed, not a retry.
 */
export class PhotoPrepError extends ConvexError<{ code: 'invalid_input', field: 'file', reason: PhotoPrepReason }> {
  /** Why: `unsupported_type` for a file that is no photo, `too_large` for one with more pixels than a tab can be counted on to open, `unreadable` for one this browser could not open. */
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
 * Image types that are no photo to prepare. An SVG has no size of its own
 * to draw at, so it would be sent as a 1 × 1 JPEG, and a GIF's animation
 * would be cut to its first frame. Send a GIF as it is, when your
 * `accept` takes one.
 */
const NOT_PHOTOS = /^image\/(?:svg\+xml|gif)\b/i

/**
 * Whether a file picked, dropped or pasted is worth preparing as a photo:
 * an image type other than SVG and GIF, or a HEIC the device left untyped.
 * A filter for a drop zone; {@link preparePhoto} refuses the rest itself.
 */
export function isPhotoFile(file: Blob): boolean {
  return isHeic(file) || (file.type.startsWith('image/') && !NOT_PHOTOS.test(file.type))
}

type Drawable = ImageBitmap | HTMLImageElement

/**
 * The most pixels a photo may have to be opened here: 100 million, more
 * than any phone or camera takes but a few high-resolution modes. Opened,
 * that is 400 MB for the pixels alone, about as much as a phone's tab can
 * be counted on for. A photo with more, or a small file whose header
 * declares more, is refused as `too_large` before it is decoded.
 */
const MAX_PHOTO_PIXELS = 100_000_000

/** Up to `length` bytes of a file, from `at`. */
async function bytesAt(file: Blob, at: number, length: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(at, at + length).arrayBuffer())
}

const ascii = (bytes: Uint8Array, at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length))

/**
 * The width times the height a JPEG's frame header declares, found by
 * stepping over the segments before it (EXIF, XMP, ICC, thumbnails), a few
 * bytes read from each. `null` when the scan begins with no frame header.
 */
async function jpegPixels(file: Blob): Promise<number | null> {
  let at = 2
  for (let segments = 0; segments < 256 && at < file.size; segments++) {
    const header = await bytesAt(file, at, 9)
    if (header.length < 4 || header[0] !== 0xFF) return null
    const marker = header[1]!
    // A fill byte before the marker.
    if (marker === 0xFF) {
      at += 1
      continue
    }
    // SOF0 to SOF15, but for DHT, JPG and DAC, which share the range: the
    // precision, then the height and the width.
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return header.length < 9 ? null : ((header[5]! << 8) | header[6]!) * ((header[7]! << 8) | header[8]!)
    }
    if (marker === 0xDA || marker === 0xD9) return null
    // TEM and RST0 to RST7 carry no length.
    at += marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7) ? 2 : 2 + ((header[2]! << 8) | header[3]!)
  }
  return null
}

/**
 * The width times the height a photo's header declares, read without
 * decoding it: JPEG, PNG and WebP, by their bytes. `null` for another type,
 * or a header this can't read, which leaves the decision to the browser.
 */
async function declaredPixels(file: Blob): Promise<number | null> {
  try {
    const head = await bytesAt(file, 0, 32)
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
    // PNG: the signature, then IHDR's width and height.
    if (head.length >= 24 && view.getUint32(0) === 0x89504E47 && ascii(head, 12, 4) === 'IHDR') return view.getUint32(16) * view.getUint32(20)
    if (head.length >= 30 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') {
      const chunk = ascii(head, 12, 4)
      // Extended: the canvas's width and height, less one, in 24 bits each.
      if (chunk === 'VP8X') return ((head[24]! | (head[25]! << 8) | (head[26]! << 16)) + 1) * ((head[27]! | (head[28]! << 8) | (head[29]! << 16)) + 1)
      // Lossy: 14 bits each, after the frame's start code.
      if (chunk === 'VP8 ') return (view.getUint16(26, true) & 0x3FFF) * (view.getUint16(28, true) & 0x3FFF)
      // Lossless: 14 bits each, less one, after the signature byte.
      if (chunk === 'VP8L') {
        const bits = view.getUint32(21, true)
        return ((bits & 0x3FFF) + 1) * (((bits >>> 14) & 0x3FFF) + 1)
      }
      return null
    }
    if (head[0] === 0xFF && head[1] === 0xD8) return await jpegPixels(file)
    return null
  }
  catch {
    return null
  }
}

/**
 * How long the HEIC decoder may take to answer for one photo, in
 * milliseconds, before the photo is refused as `unreadable`. Loading the
 * decoder is not counted: a slow connection is not a stalled decoder. A
 * decoder whose worker never started answers no call, and `heic-to` keeps
 * that worker for every later one: without a limit, a photo would wait
 * forever.
 */
const HEIC_DECODE_TIMEOUT = 60_000

/**
 * Whether the HEIC decoder left a photo unanswered past
 * {@link HEIC_DECODE_TIMEOUT}. `heic-to` sends every later photo to the
 * same worker, where each would wait a minute of its own and stay pending
 * with its bytes, and it has no way to end that worker. So until the
 * decoder answers anything again, a HEIC is not sent to it.
 */
let heicDecoderStalled = false

/** The work, or the signal's reason as soon as the signal aborts. */
async function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return await work
  signal.throwIfAborted()
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * The HEIC decoder, loaded the first time a HEIC arrives; never on the
 * server, which prepares no photo. `heic-to/csp` is the build that runs
 * under a content security policy without `'unsafe-eval'`: libheif compiled
 * to plain JavaScript, in a worker started from a `blob:` URL, which the
 * module lets through `worker-src` (src/nuxt/photos.ts). It stops when
 * `signal` aborts, with the signal's reason, and fails when the decoder has
 * not answered within {@link HEIC_DECODE_TIMEOUT}, or has left an earlier
 * photo unanswered; a bitmap that arrives after either is let go.
 */
async function decodeHeic(file: Blob, signal: AbortSignal | undefined): Promise<ImageBitmap> {
  if (heicDecoderStalled) throw new Error('The HEIC decoder has not answered an earlier photo.')
  const decoder = import.meta.server ? null : await untilAborted(import('heic-to/csp'), signal)
  if (!decoder) throw new PhotoPrepError('unreadable')
  signal?.throwIfAborted()
  const decoding = decoder.heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } })
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
    const timer = setTimeout(() => {
      heicDecoderStalled = true
      settle(() => reject(new DOMException('The HEIC decoder did not answer in time.', 'TimeoutError')))
    }, HEIC_DECODE_TIMEOUT)
    signal?.addEventListener('abort', onAbort, { once: true })
    decoding.then(
      (bitmap) => {
        heicDecoderStalled = false
        if (settled) bitmap.close()
        else settle(() => resolve(bitmap))
      },
      (error: unknown) => {
        heicDecoderStalled = false
        settle(() => reject(error))
      },
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
 * peer loaded only when one arrives, then an `<img>`, which opens a HEIC in
 * Safari when the others could not. An abort meanwhile throws the signal's
 * reason, never a refusal.
 */
async function decode(file: Blob, signal: AbortSignal | undefined): Promise<Drawable> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    // The next decoder may open it.
  }
  const heic = isHeic(file)
  let heicFailure: unknown
  if (heic) {
    try {
      return await decodeHeic(file, signal)
    }
    catch (cause) {
      signal?.throwIfAborted()
      heicFailure = cause
    }
  }
  try {
    if (typeof Image !== 'function') throw new TypeError('No image decoder in this environment')
    // An untyped HEIC is named one, so its data: URL tells the <img> what it holds.
    return await decodeImage(heic && !file.type ? new Blob([file], { type: 'image/heic' }) : file)
  }
  catch (cause) {
    signal?.throwIfAborted()
    // For a HEIC, the decoder's failure says more than the <img>'s.
    const failure = heicFailure ?? cause
    throw failure instanceof PhotoPrepError ? failure : new PhotoPrepError('unreadable', { cause: failure })
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
 * photo (an SVG and a GIF are not), one over 100 megapixels, which a tab
 * can't be counted on to open, or one this browser can't open, is refused
 * with a {@link PhotoPrepError}.
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
  if ((await declaredPixels(file) ?? 0) > MAX_PHOTO_PIXELS) throw new PhotoPrepError('too_large')
  signal?.throwIfAborted()
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
