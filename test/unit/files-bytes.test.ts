import { describe, expect, test } from 'vitest'
import { isAcceptedType, signFileUrl, sniffContentType, stripImageMetadata, verifyFileUrl } from '../../src/convex/files'
import { jpegSegments, orientationOf, webpChunks } from '../helpers/images'

// The byte-level decisions files.test.ts leaves out: the rarer signatures a
// file is sniffed by, text whose first kilobyte ends mid-character, and the
// containers a camera or an editor writes in less common shapes (a JPEG
// without JFIF, a progressive scan, fill bytes, a big-endian EXIF block, a
// rotated WebP), each stripped without losing the image or its orientation.

const ascii = (text: string): number[] => [...text].map(char => char.charCodeAt(0))
const text = (value: string) => new TextEncoder().encode(value)

function concat(parts: Array<Uint8Array | number[]>): Uint8Array {
  return new Uint8Array(parts.flatMap(part => [...part]))
}

/** A TIFF block with one IFD: an unrelated tag first, then the orientation, in either byte order. */
function tiff(orientation: number, { order = 'MM' as 'MM' | 'II' } = {}): Uint8Array {
  const bytes = new Uint8Array(38)
  const view = new DataView(bytes.buffer)
  const little = order === 'II'
  bytes.set(ascii(order))
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little)
  view.setUint16(8, 2, little)
  // ImageDescription, ASCII: the tag the orientation's reader passes over.
  view.setUint16(10, 0x010E, little)
  view.setUint16(12, 2, little)
  view.setUint32(14, 4, little)
  bytes.set(ascii('GPS'), 18)
  // Orientation, SHORT.
  view.setUint16(22, 0x0112, little)
  view.setUint16(24, 3, little)
  view.setUint32(26, 1, little)
  view.setUint16(30, orientation, little)
  view.setUint32(34, 0, little)
  return bytes
}

/** A JPEG segment: its marker and its data, the length counted in. */
function segment(marker: number, data: Uint8Array | number[]): Uint8Array {
  const length = data.length + 2
  return concat([[0xFF, marker, length >> 8, length & 0xFF], data])
}

const exifSegment = (block: Uint8Array) => segment(0xE1, concat([[...ascii('Exif'), 0, 0], block]))
const DQT = segment(0xDB, Array.from({ length: 65 }, () => 1))
const SCAN = concat([segment(0xDA, [1, 1, 0, 0, 0x3F, 0]), [0x12, 0x34, 0x56, 0xFF, 0xD9]])

/** A JPEG as a camera that writes no JFIF marker does: SOI, EXIF, the tables, the scan. */
const cameraJpeg = (block: Uint8Array) => concat([[0xFF, 0xD8], exifSegment(block), DQT, SCAN])

/** A RIFF chunk, padded to an even size unless told not to be. */
function riff(type: string, data: Uint8Array | number[], { pad = true } = {}): Uint8Array {
  const header = new Uint8Array(8)
  header.set(ascii(type))
  new DataView(header.buffer).setUint32(4, data.length, true)
  return concat([header, data, pad && data.length % 2 ? [0] : []])
}

function webp(...chunks: Uint8Array[]): Uint8Array {
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'))
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  header.set(ascii('WEBP'), 8)
  return concat([header, body])
}

/** The data of a WebP's chunk of one type. */
function webpChunk(bytes: Uint8Array, type: string): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true)
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) === type) return bytes.subarray(at + 8, at + 8 + size)
    at += 8 + size + (size % 2)
  }
  return undefined
}

/** The orientation a bare TIFF block holds. */
function tiffOrientation(block: Uint8Array): number | undefined {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const little = block[0] === 0x49
  const ifd = view.getUint32(4, little)
  for (let index = 0; index < view.getUint16(ifd, little); index++) {
    const entry = ifd + 2 + index * 12
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
  }
  return undefined
}

const ftyp = (brand: string) => concat([[0, 0, 0, 0x18], ascii('ftyp'), ascii(brand), [0, 0, 0, 0]])

describe('sniffContentType', () => {
  test.each([
    ['a GIF87a', text('GIF87a....'), 'image/gif'],
    ['an Ogg stream', text('OggS\0\x02'), 'audio/ogg'],
    ['a FLAC file', text('fLaC\0\0\0\x22'), 'audio/flac'],
    ['an MP3 with an ID3 tag', text('ID3\x04\0\0'), 'audio/mpeg'],
    ['an MP3 that opens on a bare frame', new Uint8Array([0xFF, 0xFB, 0x90, 0x64, 0x00]), 'audio/mpeg'],
    ['a bitmap', text('BM\x36\0\0\0'), 'image/bmp'],
    ['an icon', new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]), 'image/x-icon'],
    ['a little-endian TIFF', new Uint8Array([0x49, 0x49, 0x2A, 0x00, 8, 0, 0, 0]), 'image/tiff'],
    ['a big-endian TIFF', new Uint8Array([0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8]), 'image/tiff'],
    ['a WebM video', new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42]), 'video/webm'],
    ['a WAV file', text('RIFF\0\0\0\0WAVEfmt '), 'audio/wav'],
    ['an AVI file', text('RIFF\0\0\0\0AVI LIST'), 'video/x-msvideo'],
    ['an iPhone\'s HEIC photo', ftyp('heic'), 'image/heic'],
    ['a HEIF image', ftyp('mif1'), 'image/heif'],
    ['a QuickTime movie', ftyp('qt  '), 'video/quicktime'],
    ['an M4A track', ftyp('M4A '), 'audio/mp4'],
    ['a video of any other brand', ftyp('isom'), 'video/mp4'],
    ['XML that is no SVG', text('<?xml version="1.0"?>\n<feed></feed>'), 'application/xml'],
    ['an SVG with no XML declaration', text('<svg viewBox="0 0 1 1"></svg>'), 'image/svg+xml'],
    ['a page that opens on a script', text('<script>alert(1)</script>'), 'text/html'],
    ['a page that opens on a link', text('<a href="https://example.com">x</a>'), 'text/html'],
    ['markup after a byte-order mark', new Uint8Array([0xEF, 0xBB, 0xBF, ...text('<svg></svg>')]), 'image/svg+xml'],
  ])('reads %s from its first bytes', (_, bytes, type) => {
    expect(sniffContentType(bytes)).toBe(type)
  })

  test('knows nothing of a RIFF form it does not list, or of text with control characters in it', () => {
    expect(sniffContentType(text('RIFF\0\0\0\0ABCD\0\0\0\0'))).toBeNull()
    expect(sniffContentType(text('a name\x01with a control character'))).toBeNull()
    expect(sniffContentType(new Uint8Array([0x61, 0xFF, 0x61]))).toBeNull()
    // A stray continuation byte where the first kilobyte ends is no character cut short.
    expect(sniffContentType(new Uint8Array([...text('a'.repeat(1023)), 0x80, ...text('more')]))).toBeNull()
  })

  test('reads a long text whose first kilobyte ends in the middle of a character as text', () => {
    // Its head is cut 1, 2 and 3 bytes into a character: a strict decoder of the cut would fail.
    for (const [lead, char] of [[1023, 'é'], [1022, '€'], [1021, '😀']] as const) {
      expect(sniffContentType(text(`${'a'.repeat(lead)}${char} and more after it`))).toBe('text/plain')
    }
    expect(sniffContentType(text(`<svg>${'x'.repeat(1018)}é</svg>`))).toBe('image/svg+xml')
  })

  test('takes an ArrayBuffer as it takes bytes', () => {
    expect(sniffContentType(text('%PDF-1.7').buffer as ArrayBuffer)).toBe('application/pdf')
  })
})

describe('isAcceptedType', () => {
  test('a bare `*` admits any type but the scriptable ones', () => {
    expect(isAcceptedType('application/pdf', ['*'])).toBe(true)
    expect(isAcceptedType('image/svg+xml', ['*'])).toBe(false)
    expect(isAcceptedType('image/png', [' IMAGE/PNG '])).toBe(true)
  })
})

describe('stripImageMetadata on a JPEG', () => {
  test('a camera\'s JPEG without JFIF keeps its orientation as the first segment after SOI', () => {
    const stripped = stripImageMetadata(cameraJpeg(tiff(6)), 'image/jpeg')
    expect(jpegSegments(stripped)).toEqual(['E1', 'DB', 'DA'])
    expect(Array.from(stripped.subarray(0, 4))).toEqual([0xFF, 0xD8, 0xFF, 0xE1])
    expect(orientationOf(stripped)).toBe(6)
    expect(new TextDecoder().decode(stripped)).not.toContain('GPS')
  })

  test('reads the orientation of a little-endian block as of a big-endian one', () => {
    expect(orientationOf(stripImageMetadata(cameraJpeg(tiff(8, { order: 'II' })), 'image/jpeg'))).toBe(8)
    expect(orientationOf(stripImageMetadata(cameraJpeg(tiff(3, { order: 'MM' })), 'image/jpeg'))).toBe(3)
  })

  test('keeps no orientation it cannot read: none at all, out of range, a block too short, of no byte order, or an IFD past its end', () => {
    // An IFD with the description alone.
    const none = tiff(6)
    new DataView(none.buffer).setUint16(8, 1)
    const outOfRange = tiff(9)
    const tooShort = new Uint8Array(ascii('MM\0*'))
    const noOrder = tiff(6)
    noOrder.set(ascii('XX'))
    const ifdPastEnd = tiff(6)
    new DataView(ifdPastEnd.buffer).setUint32(4, 400)
    // An IFD that claims more entries than the block holds.
    const entriesPastEnd = tiff(6).subarray(0, 30)
    new DataView(entriesPastEnd.buffer).setUint16(8, 5)
    for (const block of [none, outOfRange, tooShort, noOrder, ifdPastEnd, entriesPastEnd]) {
      const stripped = stripImageMetadata(cameraJpeg(block), 'image/jpeg')
      expect(jpegSegments(stripped)).toEqual(['DB', 'DA'])
    }
  })

  test('drops the fill bytes between segments, and keeps the image itself', () => {
    const filled = concat([[0xFF, 0xD8, 0xFF, 0xFF], DQT, SCAN])
    expect(Array.from(stripImageMetadata(filled, 'image/jpeg'))).toEqual(Array.from(concat([[0xFF, 0xD8], DQT, SCAN])))
  })

  test('a progressive JPEG ends at its last scan\'s end, not at a marker a table between scans holds', () => {
    // A Huffman table between the scans whose data holds FF D9, then the second scan; fill bytes before its end.
    const between = segment(0xC4, [0x00, 0xFF, 0xD9, 0x01])
    const scans = concat([segment(0xDA, [1, 1, 0, 0, 0x3F, 0]), [0x12, 0x34], between, segment(0xDA, [1, 1, 0, 1, 0x3F, 0]), [0x56, 0xFF, 0xFF, 0xD9]])
    const jpeg = concat([[0xFF, 0xD8], DQT, scans, text('appended data with Exif GPS')])
    expect(Array.from(stripImageMetadata(jpeg, 'image/jpeg'))).toEqual(Array.from(concat([[0xFF, 0xD8], DQT, scans])))
  })

  test('keeps a scan with no end marker whole, even one cut inside a segment\'s header', () => {
    const unended = concat([[0xFF, 0xD8], DQT, segment(0xDA, [1, 1, 0, 0, 0x3F, 0]), [0x12, 0x34, 0x56]])
    expect(stripImageMetadata(unended, 'image/jpeg')).toEqual(unended)
    const cut = concat([[0xFF, 0xD8], DQT, segment(0xDA, [1, 1, 0, 0, 0x3F, 0]), [0x12, 0xFF, 0xC4, 0x00]])
    expect(stripImageMetadata(cut, 'image/jpeg')).toEqual(cut)
  })

  test('throws on bytes between segments that are no marker', () => {
    expect(() => stripImageMetadata(new Uint8Array([0xFF, 0xD8, 0x00, 0x00, 0x00, 0x00]), 'image/jpeg')).toThrow(/Not a JPEG segment/)
  })
})

describe('stripImageMetadata on a PNG and a WebP', () => {
  test('a PNG chunk that runs past the end of the file throws', () => {
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, 1000)
    const png = concat([[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], length, ascii('IDAT'), [1, 2, 3, 0, 0, 0, 0]])
    expect(() => stripImageMetadata(png, 'image/png')).toThrow(/runs past the end/)
  })

  test('a rotated WebP keeps an EXIF chunk with its orientation alone, and its VP8X flag says so', () => {
    const rotated = webp(
      riff('VP8X', [0x0C, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      riff('VP8L', [0x2F, 0, 0, 0, 0]),
      // EXIF as some encoders write it: with the JPEG segment's `Exif\0\0` prefix.
      riff('EXIF', concat([[...ascii('Exif'), 0, 0], tiff(6, { order: 'II' })])),
      riff('XMP ', ascii('<x:xmpmeta>GPS</x:xmpmeta>')),
    )
    const stripped = stripImageMetadata(rotated, 'image/webp')
    expect(webpChunks(stripped)).toEqual(['VP8X', 'VP8L', 'EXIF'])
    // Bit 3 (EXIF) on, bit 2 (XMP) off.
    expect(stripped[20]! & 0x0C).toBe(0x08)
    expect(tiffOrientation(webpChunk(stripped, 'EXIF')!)).toBe(6)
    expect(new TextDecoder().decode(stripped)).not.toContain('GPS')
    expect(new DataView(stripped.buffer, stripped.byteOffset).getUint32(4, true)).toBe(stripped.length - 8)
  })

  test('a simple WebP, with no VP8X, comes back as it was', () => {
    const simple = webp(riff('VP8 ', [0x30, 0x01, 0x00, 0x9D, 0x01, 0x2A, 0x01]))
    expect(stripImageMetadata(simple, 'image/webp')).toEqual(simple)
  })

  test('an odd last chunk that lacks its pad byte is kept, and a chunk past the end throws', () => {
    const unpadded = webp(riff('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), riff('VP8L', [0x2F, 0, 0, 0, 0], { pad: false }))
    expect(webpChunks(stripImageMetadata(unpadded, 'image/webp'))).toEqual(['VP8X', 'VP8L'])
    const header = new Uint8Array(8)
    header.set(ascii('VP8L'))
    new DataView(header.buffer).setUint32(4, 1000, true)
    expect(() => stripImageMetadata(webp(concat([header, [1, 2, 3]])), 'image/webp')).toThrow(/runs past the end/)
  })

  test('takes an ArrayBuffer as it takes bytes', () => {
    const jpeg = cameraJpeg(tiff(6))
    expect(stripImageMetadata(jpeg.buffer as ArrayBuffer, 'image/jpeg')).toEqual(stripImageMetadata(jpeg, 'image/jpeg'))
  })
})

describe('verifyFileUrl', () => {
  test('refuses a signature of another length without comparing it', async () => {
    const signature = await signFileUrl('secret', 'kg2abc', 1_000_000)
    expect(await verifyFileUrl('secret', 'kg2abc', 1_000_000, signature.slice(1))).toBe(false)
    expect(await verifyFileUrl('secret', 'kg2abc', 1_000_000, `${signature}x`)).toBe(false)
  })
})
