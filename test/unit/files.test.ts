import { describe, expect, test } from 'vitest'
import { isAcceptedType, isRasterImage, signedUrlExpiry, signFileUrl, SIGNED_URL_TTL_MAX_MS, sniffContentType, stripImageMetadata, verifyFileUrl } from '../../src/convex/files'
import { exifJpeg, gpsPng, gpsWebp, jpegSegments, orientationOf, pngChunks, webpChunks } from '../helpers/images'

// What the storage layer reads from a file's bytes: the type from its
// signature, the metadata stripped from an image without touching its
// pixels, and the signatures of expiring URLs and share tokens.

const text = (value: string) => new TextEncoder().encode(value)

describe('sniffContentType', () => {
  test.each([
    ['a PNG', new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]), 'image/png'],
    ['a JPEG', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]), 'image/jpeg'],
    ['a GIF', text('GIF89a....'), 'image/gif'],
    ['a WebP', text('RIFF\0\0\0\0WEBPVP8 '), 'image/webp'],
    ['an AVIF', new Uint8Array([0, 0, 0, 0x1C, ...text('ftypavif'), 0, 0, 0, 0]), 'image/avif'],
    ['a PDF', text('%PDF-1.7\n'), 'application/pdf'],
    ['a zip', new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0, 0]), 'application/zip'],
    ['an SVG', text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
    ['an HTML page', text('  <!DOCTYPE html><html></html>'), 'text/html'],
    ['plain text', text('not an image'), 'text/plain'],
  ])('reads %s from its first bytes', (_, bytes, type) => {
    expect(sniffContentType(bytes)).toBe(type)
  })

  test('knows nothing of random binary or an empty file', () => {
    expect(sniffContentType(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFE]))).toBeNull()
    expect(sniffContentType(new Uint8Array())).toBeNull()
  })
})

describe('isAcceptedType', () => {
  test('matches a listed type, or a wildcard', () => {
    expect(isAcceptedType('image/png', ['image/png'])).toBe(true)
    expect(isAcceptedType('image/webp', ['image/*'])).toBe(true)
    expect(isAcceptedType('application/pdf', ['image/*'])).toBe(false)
    expect(isAcceptedType(null, ['*/*'])).toBe(false)
  })

  test('never lets SVG or HTML in through a wildcard: they must be named', () => {
    expect(isAcceptedType('image/svg+xml', ['image/*'])).toBe(false)
    expect(isAcceptedType('text/html', ['*/*'])).toBe(false)
    expect(isAcceptedType('image/svg+xml', ['image/svg+xml'])).toBe(true)
  })

  test('while metadata is stripped, a wildcard never lets in an image whose EXIF stays', () => {
    expect(isAcceptedType('image/heic', ['image/*'], { strip: true })).toBe(false)
    expect(isAcceptedType('image/tiff', ['*/*'], { strip: true })).toBe(false)
    expect(isAcceptedType('image/jpeg', ['image/*'], { strip: true })).toBe(true)
    expect(isAcceptedType('image/heic', ['image/*'])).toBe(true)
  })

  test('only raster images render inline', () => {
    expect(isRasterImage('image/jpeg')).toBe(true)
    expect(isRasterImage('image/svg+xml')).toBe(false)
    expect(isRasterImage('application/pdf')).toBe(false)
  })
})

describe('stripImageMetadata', () => {
  test('a JPEG loses EXIF (GPS included), XMP, IPTC and comments, and keeps its profile, its scan and its orientation', () => {
    const original = exifJpeg({ orientation: 6 })
    expect(jpegSegments(original)).toEqual(['E0', 'E1', 'E1', 'E2', 'ED', 'FE', 'DB', 'DA'])
    const stripped = stripImageMetadata(original, 'image/jpeg')
    expect(jpegSegments(stripped)).toEqual(['E0', 'E1', 'E2', 'DB', 'DA'])
    expect(new TextDecoder().decode(stripped)).not.toContain('GPS')
    expect(new TextDecoder().decode(stripped)).not.toContain('adobe')
    expect(orientationOf(stripped)).toBe(6)
    // The scan, the pixels, is copied byte for byte.
    expect(stripped.subarray(stripped.length - 8)).toEqual(original.subarray(original.length - 8))
  })

  test('a JPEG ends at its first image: an appended one, with EXIF of its own, and the Multi-Picture index go', () => {
    const primary = exifJpeg()
    const withPreview = new Uint8Array([...primary, ...exifJpeg()])
    expect(stripImageMetadata(withPreview, 'image/jpeg')).toEqual(stripImageMetadata(primary, 'image/jpeg'))
    // Stuffed bytes and restarts inside the scan are no end; the MPF segment goes with what it indexed.
    const mpf = [0xFF, 0xE2, 0x00, 0x08, ...text('MPF'), 0, 0x49, 0x49]
    const scan = [0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0, 0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56, 0xFF, 0xD9]
    const jpeg = new Uint8Array([0xFF, 0xD8, ...mpf, ...scan, ...text('Exif GPS of the second image')])
    const stripped = stripImageMetadata(jpeg, 'image/jpeg')
    expect(Array.from(stripped)).toEqual([0xFF, 0xD8, ...scan])
  })

  test('an upright JPEG keeps no EXIF block at all', () => {
    const stripped = stripImageMetadata(exifJpeg({ orientation: 1 }), 'image/jpeg')
    expect(jpegSegments(stripped)).toEqual(['E0', 'E2', 'DB', 'DA'])
  })

  test('a PNG loses its eXIf and text chunks, and keeps the rest', () => {
    const stripped = stripImageMetadata(gpsPng(), 'image/png')
    expect(pngChunks(stripped)).toEqual(['IHDR', 'iCCP', 'IDAT', 'IEND'])
  })

  test('a WebP loses its EXIF and XMP chunks and their flags, its size rewritten', () => {
    const stripped = stripImageMetadata(gpsWebp(), 'image/webp')
    expect(webpChunks(stripped)).toEqual(['VP8X', 'VP8L'])
    expect(stripped[20]! & 0x0C).toBe(0)
    expect(new DataView(stripped.buffer, stripped.byteOffset).getUint32(4, true)).toBe(stripped.length - 8)
  })

  test('a broken container throws, and another type comes back as it is', () => {
    expect(() => stripImageMetadata(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF]), 'image/jpeg')).toThrow()
    const pdf = text('%PDF-1.7')
    expect(stripImageMetadata(pdf, 'application/pdf')).toBe(pdf)
  })
})

describe('signed URLs and share tokens', () => {
  test('a signature verifies for its file and expiry only', async () => {
    const signature = await signFileUrl('secret', 'kg2abc', 1_000_000)
    expect(await verifyFileUrl('secret', 'kg2abc', 1_000_000, signature)).toBe(true)
    expect(await verifyFileUrl('secret', 'kg2abc', 1_000_001, signature)).toBe(false)
    expect(await verifyFileUrl('secret', 'kg2xyz', 1_000_000, signature)).toBe(false)
    expect(await verifyFileUrl('other', 'kg2abc', 1_000_000, signature)).toBe(false)
  })

  test('an expiry is capped at seven days and rounded up to the minute', () => {
    expect(signedUrlExpiry(0)).toBe(60 * 60 * 1000)
    expect(signedUrlExpiry(0, 30 * 24 * 60 * 60 * 1000)).toBe(SIGNED_URL_TTL_MAX_MS)
    expect(signedUrlExpiry(1, 1000)).toBe(60_000)
    expect(signedUrlExpiry(0, -5)).toBe(60 * 60 * 1000)
  })
})
