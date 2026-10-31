/**
 * Where a manifest store and the XMP metadata go in each image format C2PA
 * writing here supports, and how each one is found: JPEG (APP11 segments
 * for the manifest, APP1 for XMP), PNG (a `caBX` chunk, an `iTXt` chunk) and
 * WebP (a `C2PA` chunk, an `XMP ` chunk, in an extended-format file).
 *
 * Every `insert*` places the manifest store's container at one offset and
 * says where it went, so the data hash can exclude exactly those bytes.
 */
import { concatBytes } from '../bytes.js'

export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The format the bytes are, by their signature; null for any other. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if ([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((byte, i) => bytes[i] === byte)) return 'image/png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

/** The IPTC digital source types the package writes. */
export const DIGITAL_SOURCE_TYPES = {
  trainedAlgorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  compositeWithTrainedAlgorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
} as const

const IPTC_EXT = 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/'

/** An rdf:Description that says the image's digital source type. */
function sourceTypeDescription(sourceType: string): string {
  return `<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="${IPTC_EXT}" Iptc4xmpExt:DigitalSourceType="${sourceType}"/>`
}

/** A whole XMP packet carrying the source type alone. */
function xmpPacket(sourceType: string): string {
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${sourceTypeDescription(sourceType)}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
}

/**
 * `xmp` with the source type in it: an existing packet that names a source
 * type already is kept as it is (the model's own word stands), one that
 * names none gets a description of its own; null when it cannot be read.
 */
function withSourceType(xmp: string | null, sourceType: string): string | null {
  if (xmp === null) return xmpPacket(sourceType)
  if (xmp.includes('DigitalSourceType')) return xmp
  const end = xmp.indexOf('</rdf:RDF>')
  return end === -1 ? null : `${xmp.slice(0, end)}${sourceTypeDescription(sourceType)}${xmp.slice(end)}`
}

/** What a format reads and writes: whether credentials are there, the XMP, and the store's container. */
interface FormatWriter {
  /** Whether the file carries a C2PA manifest store already. */
  hasManifest: (bytes: Uint8Array) => boolean
  /** The file with the source type in its XMP. */
  addSourceType: (bytes: Uint8Array, sourceType: string) => Uint8Array
  /** The file with `store` placed in it, and the range its container takes. */
  insertStore: (bytes: Uint8Array, store: Uint8Array) => { bytes: Uint8Array, start: number, length: number }
}

// ── JPEG ────────────────────────────────────────────────────────────────────

const XMP_NAMESPACE = 'http://ns.adobe.com/xap/1.0/\0'
/** The most box data one APP11 segment carries: under the 64 KiB segment limit with its headers. */
const APP11_CHUNK = 65_000

interface JpegSegment {
  marker: number
  at: number
  end: number
}

/** The segments before the image data, in order. */
function jpegSegments(bytes: Uint8Array): JpegSegment[] {
  const segments: JpegSegment[] = []
  let at = 2
  while (at + 4 <= bytes.length && bytes[at] === 0xFF) {
    const marker = bytes[at + 1]!
    if (marker === 0xDA || marker === 0xD9) break
    const end = at + 2 + ((bytes[at + 2]! << 8) | bytes[at + 3]!)
    segments.push({ marker, at, end })
    at = end
  }
  return segments
}

/** Where new metadata goes: after the JFIF and Exif headers, which readers expect first. */
function jpegInsertAt(bytes: Uint8Array): number {
  let at = 2
  for (const segment of jpegSegments(bytes)) {
    if (segment.marker !== 0xE0 && segment.marker !== 0xE1) break
    at = segment.end
  }
  return at
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  if (payload.length + 2 > 0xFFFF) throw new RangeError('JPEG: a segment over 64 KiB.')
  return concatBytes([Uint8Array.of(0xFF, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xFF), payload])
}

function isXmpSegment(bytes: Uint8Array, segment: JpegSegment): boolean {
  return segment.marker === 0xE1 && ascii(bytes, segment.at + 4, XMP_NAMESPACE.length) === XMP_NAMESPACE
}

const jpeg: FormatWriter = {
  hasManifest: bytes => jpegSegments(bytes).some(segment => segment.marker === 0xEB && ascii(bytes, segment.at + 4, 2) === 'JP'),
  addSourceType: (bytes, sourceType) => {
    const existing = jpegSegments(bytes).find(segment => isXmpSegment(bytes, segment))
    const xmp = existing ? decoder.decode(bytes.subarray(existing.at + 4 + XMP_NAMESPACE.length, existing.end)) : null
    const merged = withSourceType(xmp, sourceType)
    if (merged === null || merged === xmp) return bytes
    const segment = jpegSegment(0xE1, concatBytes([encoder.encode(XMP_NAMESPACE), encoder.encode(merged)]))
    if (existing) return concatBytes([bytes.subarray(0, existing.at), segment, bytes.subarray(existing.end)])
    const at = jpegInsertAt(bytes)
    return concatBytes([bytes.subarray(0, at), segment, bytes.subarray(at)])
  },
  insertStore: (bytes, store) => {
    // ISO 19566-5 in APP11: CI 'JP', box instance 1, a packet sequence
    // number from 1, then the box; every continuation repeats its header.
    const segments: Uint8Array[] = []
    const header = store.subarray(0, 8)
    for (let at = 0, sequence = 1; at < store.length; sequence++) {
      const first = at === 0
      const take = Math.min(APP11_CHUNK, store.length - at)
      const prefix = Uint8Array.of(0x4A, 0x50, 0x00, 0x01, (sequence >>> 24) & 0xFF, (sequence >> 16) & 0xFF, (sequence >> 8) & 0xFF, sequence & 0xFF)
      segments.push(jpegSegment(0xEB, concatBytes(first ? [prefix, store.subarray(0, take)] : [prefix, header, store.subarray(at, at + take)])))
      at += take
    }
    const container = concatBytes(segments)
    const start = jpegInsertAt(bytes)
    return { bytes: concatBytes([bytes.subarray(0, start), container, bytes.subarray(start)]), start, length: container.length }
  },
}

// ── PNG ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF]! ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

interface Chunk {
  type: string
  at: number
  end: number
  data: Uint8Array
}

function pngChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: Chunk[] = []
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at)
    const end = at + 12 + length
    chunks.push({ type: ascii(bytes, at + 4, 4), at, end, data: bytes.subarray(at + 8, at + 8 + length) })
    at = end
  }
  return chunks
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(encoder.encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp'

/** After IHDR: the chunk every PNG starts with. */
const pngInsertAt = (bytes: Uint8Array): number => pngChunks(bytes)[0]!.end

const png: FormatWriter = {
  hasManifest: bytes => pngChunks(bytes).some(chunk => chunk.type === 'caBX'),
  addSourceType: (bytes, sourceType) => {
    const existing = pngChunks(bytes).find(chunk => chunk.type === 'iTXt' && ascii(chunk.data, 0, PNG_XMP_KEYWORD.length + 1) === `${PNG_XMP_KEYWORD}\0`)
    // keyword\0, compression flag, method, language\0, translated keyword\0, text.
    let xmp: string | null = null
    if (existing) {
      const data = existing.data
      if (data[PNG_XMP_KEYWORD.length + 1] !== 0) return bytes
      let at = PNG_XMP_KEYWORD.length + 3
      for (let nulls = 0; nulls < 2 && at < data.length; at++) if (data[at] === 0) nulls++
      xmp = decoder.decode(data.subarray(at))
    }
    const merged = withSourceType(xmp, sourceType)
    if (merged === null || merged === xmp) return bytes
    const chunk = pngChunk('iTXt', concatBytes([encoder.encode(`${PNG_XMP_KEYWORD}\0`), Uint8Array.of(0, 0, 0, 0), encoder.encode(merged)]))
    if (existing) return concatBytes([bytes.subarray(0, existing.at), chunk, bytes.subarray(existing.end)])
    const at = pngInsertAt(bytes)
    return concatBytes([bytes.subarray(0, at), chunk, bytes.subarray(at)])
  },
  insertStore: (bytes, store) => {
    const container = pngChunk('caBX', store)
    const start = pngInsertAt(bytes)
    return { bytes: concatBytes([bytes.subarray(0, start), container, bytes.subarray(start)]), start, length: container.length }
  },
}

// ── WebP ────────────────────────────────────────────────────────────────────

function riffChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: Chunk[] = []
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true)
    const end = at + 8 + length + (length & 1)
    chunks.push({ type: ascii(bytes, at, 4), at, end, data: bytes.subarray(at + 8, at + 8 + length) })
    at = end
  }
  return chunks
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1))
  out.set(encoder.encode(type), 0)
  new DataView(out.buffer).setUint32(4, data.length, true)
  out.set(data, 8)
  return out
}

/** A RIFF file of these chunks, its size field counting them. */
function riff(chunks: readonly Uint8Array[]): Uint8Array {
  const body = concatBytes(chunks)
  const head = concatBytes([encoder.encode('RIFF'), new Uint8Array(4), encoder.encode('WEBP')])
  new DataView(head.buffer).setUint32(4, body.length + 4, true)
  return concatBytes([head, body])
}

const VP8X_XMP = 0x04
const VP8X_ALPHA = 0x10

/** The VP8X header a simple-format file needs before metadata chunks can follow: its canvas size and alpha, read from the image. */
function vp8xFor(chunks: readonly Chunk[]): Uint8Array | null {
  const image = chunks.find(chunk => chunk.type === 'VP8 ' || chunk.type === 'VP8L')
  if (!image) return null
  const data = image.data
  let width: number
  let height: number
  let flags = 0
  if (image.type === 'VP8 ') {
    width = (data[6]! | (data[7]! << 8)) & 0x3FFF
    height = (data[8]! | (data[9]! << 8)) & 0x3FFF
  }
  else {
    const bits = data[1]! | (data[2]! << 8) | (data[3]! << 16) | (data[4]! << 24)
    width = (bits & 0x3FFF) + 1
    height = ((bits >>> 14) & 0x3FFF) + 1
    if ((bits >>> 28) & 1) flags |= VP8X_ALPHA
  }
  if (chunks.some(chunk => chunk.type === 'ALPH')) flags |= VP8X_ALPHA
  const out = new Uint8Array(10)
  out[0] = flags
  const w = width - 1
  const h = height - 1
  out.set([w & 0xFF, (w >> 8) & 0xFF, (w >> 16) & 0xFF, h & 0xFF, (h >> 8) & 0xFF, (h >> 16) & 0xFF], 4)
  return out
}

const webp: FormatWriter = {
  hasManifest: bytes => riffChunks(bytes).some(chunk => chunk.type === 'C2PA'),
  addSourceType: (bytes, sourceType) => {
    const chunks = riffChunks(bytes)
    const existing = chunks.find(chunk => chunk.type === 'XMP ')
    const xmp = existing ? decoder.decode(existing.data) : null
    const merged = withSourceType(xmp, sourceType)
    if (merged === null || merged === xmp) return bytes
    const header = chunks.find(chunk => chunk.type === 'VP8X')
    const vp8x = header ? Uint8Array.from(header.data) : vp8xFor(chunks)
    if (!vp8x) return bytes
    vp8x[0] = vp8x[0]! | VP8X_XMP
    // VP8X first, the image and its other chunks in order, XMP last.
    const rest = chunks.filter(chunk => chunk.type !== 'VP8X' && chunk.type !== 'XMP ').map(chunk => bytes.subarray(chunk.at, chunk.end))
    return riff([riffChunk('VP8X', vp8x), ...rest, riffChunk('XMP ', encoder.encode(merged))])
  },
  insertStore: (bytes, store) => {
    const container = riffChunk('C2PA', store)
    const chunks = riffChunks(bytes).map(chunk => bytes.subarray(chunk.at, chunk.end))
    const out = riff([...chunks, container])
    // The exclusion is the chunk's header and data; a pad byte after an odd length stays hashed, as C2PA's RIFF binding reads it.
    return { bytes: out, start: out.length - container.length, length: 8 + store.length }
  },
}

/** The writer of each supported format. */
export const FORMAT_WRITERS: Readonly<Record<ImageFormat, FormatWriter>> = {
  'image/jpeg': jpeg,
  'image/png': png,
  'image/webp': webp,
}
