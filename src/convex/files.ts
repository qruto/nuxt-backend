// What the storage layer knows about a file's bytes, runtime-neutral: the
// type read from its signature (never from its name or the type a browser
// declared), the metadata stripped from an image before it is kept, and the
// signature of an expiring URL. The component's checks (`storage.ts`), the
// app's `setupStorage` and the HTTP route that serves a signed URL all read
// it; it needs only Web Crypto.

import { concatBytes } from './bytes.js'
import { base64url } from './tokens.js'

/** The largest file `setupStorage` keeps by default: 10 MB. */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024

/** The types `setupStorage` keeps by default: raster images whose metadata it strips. */
export const DEFAULT_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** An upload nobody claimed is deleted by the component's maintenance once it is this old. */
export const UNCLAIMED_FILE_MS = 24 * 60 * 60 * 1000

/** How long a signed URL works by default: an hour. */
export const SIGNED_URL_TTL_MS = 60 * 60 * 1000

/** The longest a signed URL works: seven days. */
export const SIGNED_URL_TTL_MAX_MS = 7 * 24 * 60 * 60 * 1000

/** Where a signed URL is served, on the deployment's HTTP routes: `<site>/storage/<id>?expires=…&signature=…`. */
export const SIGNED_URL_PATH = '/storage/'

/** The types a wildcard in `accept` (`image/*`) never admits: both can carry script. */
const SCRIPTABLE_TYPES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml'])

/** The bytes of an ASCII string. */
const ascii = (text: string): number[] => [...text].map(char => char.charCodeAt(0))

/** Whether `bytes` holds `pattern` at `offset`. */
function startsWith(bytes: Uint8Array, pattern: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) return false
  return pattern.every((byte, index) => bytes[offset + index] === byte)
}

/** Four bytes as ASCII, for a chunk or a brand. */
function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4))
}

/** The ISO base media brands, by the type they are. */
const BRANDS: Record<string, string> = {
  'avif': 'image/avif',
  'avis': 'image/avif',
  'heic': 'image/heic',
  'heix': 'image/heic',
  'hevc': 'image/heic',
  'heim': 'image/heic',
  'heis': 'image/heic',
  'mif1': 'image/heif',
  'msf1': 'image/heif',
  'qt  ': 'video/quicktime',
  'M4A ': 'audio/mp4',
}

/** The signatures a type opens with, in the order they are tried. */
const SIGNATURES: ReadonlyArray<readonly [type: string, patterns: ReadonlyArray<readonly number[]>]> = [
  ['image/png', [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]]],
  ['image/jpeg', [[0xFF, 0xD8, 0xFF]]],
  ['image/gif', [ascii('GIF87a'), ascii('GIF89a')]],
  ['application/pdf', [ascii('%PDF-')]],
  ['application/zip', [[0x50, 0x4B, 0x03, 0x04]]],
  ['video/webm', [[0x1A, 0x45, 0xDF, 0xA3]]],
  ['audio/ogg', [ascii('OggS')]],
  ['audio/flac', [ascii('fLaC')]],
  ['audio/mpeg', [ascii('ID3')]],
  ['image/bmp', [ascii('BM')]],
  ['image/x-icon', [[0x00, 0x00, 0x01, 0x00]]],
  ['image/tiff', [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]]],
]

/** The RIFF forms, by the type they are. */
const RIFF_FORMS: Record<string, string> = { 'WEBP': 'image/webp', 'WAVE': 'audio/wav', 'AVI ': 'video/x-msvideo' }

/** A file that starts like text: markup when it opens like markup, else plain text when every byte reads as UTF-8 text. */
function textType(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, 1024)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head.length < bytes.length ? trimPartialChar(head) : head)
  }
  catch {
    return null
  }
  const opening = text.replace(/^\uFEFF/, '').trimStart().toLowerCase()
  if (/^<svg[\s>]/.test(opening) || (opening.startsWith('<?xml') && opening.includes('<svg'))) return 'image/svg+xml'
  if (/^<(?:!doctype html|html|head|body|script|iframe|meta|title|style|div|a\s)/.test(opening)) return 'text/html'
  if (opening.startsWith('<?xml')) return 'application/xml'
  // Control characters other than tab, line feed, carriage return and form feed are not text.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text)) return null
  return 'text/plain'
}

/** A prefix cut mid-character would fail the strict decoder: drop the trailing partial sequence. */
function trimPartialChar(bytes: Uint8Array): Uint8Array {
  let end = bytes.length
  for (let back = 1; back <= 3 && end - back >= 0; back++) {
    const byte = bytes[end - back]!
    if ((byte & 0xC0) === 0x80) continue
    if ((byte & 0xC0) === 0xC0) end -= back
    break
  }
  return bytes.subarray(0, end)
}

/**
 * The type a file is, read from its signature (its first bytes), or `null`
 * for one the package does not recognise. Never the name, never the type the
 * browser declared: Convex stores that one as sent.
 */
export function sniffContentType(input: Uint8Array | ArrayBuffer): string | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const signed = SIGNATURES.find(([, patterns]) => patterns.some(pattern => startsWith(bytes, pattern)))
  if (signed) return signed[0]
  return containerType(bytes) ?? (isMpegFrame(bytes) ? 'audio/mpeg' : null) ?? (bytes.length > 0 ? textType(bytes) : null)
}

/** A type read from a container's own header: a RIFF form, or an ISO base media brand. */
function containerType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (startsWith(bytes, ascii('RIFF'))) return RIFF_FORMS[fourCC(bytes, 8)] ?? null
  if (fourCC(bytes, 4) === 'ftyp') return BRANDS[fourCC(bytes, 8)] ?? 'video/mp4'
  return null
}

/** An MPEG audio frame's sync bits, which an MP3 without an ID3 tag opens with. */
const isMpegFrame = (bytes: Uint8Array): boolean => bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0

/**
 * Image types that carry a camera's EXIF (GPS included) which
 * {@link stripImageMetadata} cannot remove: HEIC, HEIF and AVIF keep it in
 * their own boxes, and TIFF is itself an EXIF container.
 */
export const UNSTRIPPABLE_TYPES = new Set(['image/heic', 'image/heif', 'image/avif', 'image/tiff'])

/**
 * Whether a sniffed type is one `accept` lists: by name, or by a wildcard
 * (`image/*`, `*\/*`) that never admits SVG or HTML, which can carry script
 * and must be named to be kept. While metadata is stripped (`strip`), a
 * wildcard never admits a type whose metadata can't be stripped either:
 * an iPhone's HEIC photo would keep where it was taken.
 */
export function isAcceptedType(type: string | null, accept: readonly string[], { strip = false }: { strip?: boolean } = {}): type is string {
  if (!type) return false
  return accept.some((entry) => {
    const wanted = entry.trim().toLowerCase()
    if (wanted === type) return true
    if (SCRIPTABLE_TYPES.has(type)) return false
    if (strip && UNSTRIPPABLE_TYPES.has(type)) return false
    if (wanted === '*/*' || wanted === '*') return true
    return wanted.endsWith('/*') && type.startsWith(wanted.slice(0, -1))
  })
}

/** Whether a type renders as an image in a browser, safely: raster images only, never SVG. */
export function isRasterImage(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.startsWith('image/') && !SCRIPTABLE_TYPES.has(type)
}

/** The types {@link stripImageMetadata} rewrites. */
export const STRIPPABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// ── EXIF orientation ───────────────────────────────────────────────────

/** The orientation tag of a TIFF block (EXIF without its `Exif\0\0` prefix): 1–8, or `undefined`. */
function readOrientation(tiff: Uint8Array): number | undefined {
  if (tiff.length < 8) return undefined
  const little = tiff[0] === 0x49 && tiff[1] === 0x49
  if (!little && !(tiff[0] === 0x4D && tiff[1] === 0x4D)) return undefined
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  const ifd = view.getUint32(4, little)
  if (ifd + 2 > tiff.length) return undefined
  const entries = view.getUint16(ifd, little)
  for (let index = 0; index < entries; index++) {
    const at = ifd + 2 + index * 12
    if (at + 12 > tiff.length) return undefined
    if (view.getUint16(at, little) !== 0x0112) continue
    const value = view.getUint16(at + 8, little)
    return value >= 1 && value <= 8 ? value : undefined
  }
  return undefined
}

/** A TIFF block holding the orientation tag alone, big-endian, so a rotated photo stays upright. */
function orientationTiff(orientation: number): Uint8Array {
  const tiff = new Uint8Array(26)
  const view = new DataView(tiff.buffer)
  tiff.set(ascii('MM'), 0)
  view.setUint16(2, 42)
  view.setUint32(4, 8)
  view.setUint16(8, 1)
  view.setUint16(10, 0x0112)
  view.setUint16(12, 3)
  view.setUint32(14, 1)
  view.setUint16(18, orientation)
  view.setUint32(22, 0)
  return tiff
}

const EXIF_PREFIX = [...ascii('Exif'), 0, 0]

// ── JPEG ───────────────────────────────────────────────────────────────

/** APP1 (EXIF, XMP), APP12 (Ducky), APP13 (Photoshop, IPTC) and comments: where a camera or an editor writes about the photo. */
const JPEG_METADATA = new Set([0xE1, 0xEC, 0xED, 0xFE])

/** The identifier of an APP2 segment holding a Multi-Picture Format index, which points at the images appended after the first. */
const MPF_PREFIX = [...ascii('MPF'), 0]

/**
 * A JPEG without its metadata segments, the pixels untouched: everything
 * before the scan is copied but EXIF, XMP, IPTC, comments and the
 * Multi-Picture index; the colour profile (APP2) and the JFIF and Adobe
 * markers stay, and so does the orientation, as an EXIF block that holds
 * nothing else. The file ends at the primary image's end: whatever follows
 * it (an MPF preview or gain map with EXIF of its own, appended data) goes.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]
  let orientation: number | undefined
  for (const { marker, segment } of jpegSegments(bytes)) {
    if (marker === 0xDA) kept.push(segment.subarray(0, primaryImageLength(segment)))
    else if (marker === 0xE2 && startsWith(segment, MPF_PREFIX, 4)) continue
    else if (!JPEG_METADATA.has(marker)) kept.push(segment)
    else if (marker === 0xE1 && startsWith(segment, EXIF_PREFIX, 4)) orientation ??= readOrientation(segment.subarray(10))
  }
  if (orientation && orientation !== 1) {
    // After SOI and an APP0 (JFIF) when there is one, as readers expect.
    kept.splice(kept[1]?.[1] === 0xE0 ? 2 : 1, 0, jpegOrientationSegment(orientation))
  }
  return concatBytes(kept)
}

/**
 * A JPEG's segments, in order: each before the scan with its marker, then
 * the scan and everything after it as one, which is the image itself. Fill
 * bytes between segments are dropped.
 */
function* jpegSegments(bytes: Uint8Array): Generator<{ marker: number, segment: Uint8Array }> {
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xFF) throw new Error('Not a JPEG segment.')
    const marker = bytes[at + 1]!
    if (marker === 0xFF) {
      at++
      continue
    }
    if (marker === 0xDA || marker === 0xD9) {
      yield { marker, segment: bytes.subarray(at) }
      return
    }
    const end = at + 2 + ((bytes[at + 2]! << 8) | bytes[at + 3]!)
    if (end < at + 4 || end > bytes.length) throw new Error('A JPEG segment runs past the end of the file.')
    yield { marker, segment: bytes.subarray(at, end) }
    at = end
  }
}

/**
 * How many bytes of `scan` (from the first start-of-scan marker on) belong
 * to the primary image: up to and including its end-of-image marker. The
 * entropy-coded data is walked as a decoder walks it: `FF 00` is a stuffed
 * byte and `FF D0`–`FF D7` a restart, and the segments between a
 * progressive image's scans are skipped by their length, so neither can be
 * taken for the end. A file with no end marker is kept whole.
 */
function primaryImageLength(scan: Uint8Array): number {
  let at = 0
  while (at + 1 < scan.length) {
    if (scan[at] !== 0xFF) {
      at++
      continue
    }
    const marker = scan[at + 1]!
    if (marker === 0x00 || marker === 0xFF || (marker >= 0xD0 && marker <= 0xD7)) {
      at += marker === 0xFF ? 1 : 2
      continue
    }
    if (marker === 0xD9) return at + 2
    // A segment between scans (or a scan's own header): skip its length.
    if (at + 3 >= scan.length) break
    at += 2 + ((scan[at + 2]! << 8) | scan[at + 3]!)
  }
  return scan.length
}

/** An APP1 segment holding EXIF with the orientation alone. */
function jpegOrientationSegment(orientation: number): Uint8Array {
  const tiff = orientationTiff(orientation)
  const length = 2 + EXIF_PREFIX.length + tiff.length
  return concatBytes([new Uint8Array([0xFF, 0xE1, length >> 8, length & 0xFF]), new Uint8Array(EXIF_PREFIX), tiff])
}

// ── PNG ────────────────────────────────────────────────────────────────

/** The chunks a PNG carries metadata in: EXIF, text (XMP lives in `iTXt`) and the time it was edited. */
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

/** A PNG without its metadata chunks; every other chunk is copied with its checksum. */
function stripPng(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 8
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at)
    const end = at + 12 + length
    if (end > bytes.length) throw new Error('A PNG chunk runs past the end of the file.')
    const type = fourCC(bytes, at + 4)
    if (!PNG_METADATA.has(type)) kept.push(bytes.subarray(at, end))
    at = end
    if (type === 'IEND') break
  }
  return concatBytes(kept)
}

// ── WebP ───────────────────────────────────────────────────────────────

/** A WebP without its EXIF and XMP chunks, the `VP8X` flags cleared to match; a rotated photo keeps its orientation alone. */
function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let orientation: number | undefined
  let extended: Uint8Array | null = null
  for (const { type, chunk, data } of riffChunks(bytes)) {
    if (type === 'EXIF') orientation ??= readOrientation(startsWith(data, EXIF_PREFIX) ? data.subarray(6) : data)
    else if (type === 'VP8X') chunks.push(extended = chunk.slice())
    else if (type !== 'XMP ') chunks.push(chunk)
  }
  // Bit 3 of the VP8X flags says EXIF follows, bit 2 XMP.
  if (extended) extended[8] = extended[8]! & ~0x0C
  if (extended && orientation && orientation !== 1) {
    extended[8] = extended[8]! | 0x08
    chunks.push(riffChunk('EXIF', orientationTiff(orientation)))
  }
  return concatBytes([riffHeader(chunks), ...chunks])
}

/** A RIFF file's chunks after its header: each one's type, its bytes (padding included) and its data. */
function* riffChunks(bytes: Uint8Array): Generator<{ type: string, chunk: Uint8Array, data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true)
    if (at + 8 + size > bytes.length) throw new Error('A WebP chunk runs past the end of the file.')
    const end = Math.min(at + 8 + size + (size % 2), bytes.length)
    yield { type: fourCC(bytes, at), chunk: bytes.subarray(at, end), data: bytes.subarray(at + 8, at + 8 + size) }
    at = end
  }
}

/** One RIFF chunk: its type, its size and its data (an even size, as written here). */
function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8)
  header.set(ascii(type))
  new DataView(header.buffer).setUint32(4, data.length, true)
  return concatBytes([header, data])
}

/** A WebP's RIFF header over its chunks. */
function riffHeader(chunks: Uint8Array[]): Uint8Array {
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'))
  new DataView(header.buffer).setUint32(4, chunks.reduce((sum, chunk) => sum + chunk.length, 0) + 4, true)
  header.set(ascii('WEBP'), 8)
  return header
}

/**
 * An image's bytes without its EXIF, XMP, IPTC and GPS data, its container
 * rewritten and its pixels untouched, so quality is unchanged: JPEG, PNG and
 * WebP. A photo taken sideways keeps its orientation, alone, so it still
 * shows upright. Any other type comes back as it is. Throws on a file whose
 * container is broken, which a check reads as a type it does not accept.
 */
export function stripImageMetadata(input: Uint8Array | ArrayBuffer, type: string): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (type === 'image/jpeg') return stripJpeg(bytes)
  if (type === 'image/png') return stripPng(bytes)
  if (type === 'image/webp') return stripWebp(bytes)
  return bytes
}

// ── Signed URLs ────────────────────────────────────────────────────────

/** The HMAC key a signed URL is signed with: derived from the app's secret for this one purpose, so it signs nothing else. */
async function urlKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('nuxt-backend:storage-url'))
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** The signature of a file's URL until `expires` (epoch ms), with the app's secret. */
export async function signFileUrl(secret: string, storageId: string, expires: number): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await urlKey(secret), new TextEncoder().encode(`${storageId}:${expires}`))
  return base64url(new Uint8Array(mac))
}

/** Whether a signature is the one {@link signFileUrl} makes for the file and expiry, compared in constant time. */
export async function verifyFileUrl(secret: string, storageId: string, expires: number, signature: string): Promise<boolean> {
  const expected = await signFileUrl(secret, storageId, expires)
  if (expected.length !== signature.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  return difference === 0
}

/**
 * When a signed URL minted now for `ttl` expires: `ttl` clamped to
 * {@link SIGNED_URL_TTL_MAX_MS}, rounded up to the minute so the same
 * query read twice in a minute answers the same URL.
 */
export function signedUrlExpiry(now: number, ttl: number = SIGNED_URL_TTL_MS): number {
  const span = Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, SIGNED_URL_TTL_MAX_MS) : SIGNED_URL_TTL_MS
  return Math.ceil((now + span) / 60_000) * 60_000
}
