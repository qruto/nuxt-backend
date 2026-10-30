// Small images built byte by byte, with the metadata a phone or an editor
// writes: EXIF with an orientation and a GPS block, XMP, IPTC, comments and
// text chunks. Structurally valid containers; the pixel data is a stand-in.

const ascii = (text: string): number[] => [...text].map(char => char.charCodeAt(0))

function concat(parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrays = parts.map(part => part instanceof Uint8Array ? part : new Uint8Array(part))
  const out = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of arrays) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A little-endian TIFF block: IFD0 with the orientation and a GPS pointer, a GPS IFD, and a note naming the place. */
function exifTiff(orientation: number): Uint8Array {
  const tiff = new Uint8Array(64)
  const view = new DataView(tiff.buffer)
  tiff.set(ascii('II'))
  view.setUint16(2, 42, true)
  view.setUint32(4, 8, true)
  view.setUint16(8, 2, true)
  // Orientation, SHORT.
  view.setUint16(10, 0x0112, true)
  view.setUint16(12, 3, true)
  view.setUint32(14, 1, true)
  view.setUint16(18, orientation, true)
  // GPS IFD pointer, LONG.
  view.setUint16(22, 0x8825, true)
  view.setUint16(24, 4, true)
  view.setUint32(26, 1, true)
  view.setUint32(30, 38, true)
  view.setUint32(34, 0, true)
  // GPS IFD: GPSLatitudeRef 'N'.
  view.setUint16(38, 1, true)
  view.setUint16(40, 0x0001, true)
  view.setUint16(42, 2, true)
  view.setUint32(44, 2, true)
  tiff.set(ascii('N\0'), 48)
  view.setUint32(52, 0, true)
  tiff.set(ascii('GPS52N'), 56)
  return tiff
}

/** A JPEG segment: its marker and its data, the length counted in. */
function segment(marker: number, data: Uint8Array | number[]): Uint8Array {
  const length = data.length + 2
  return concat([[0xFF, marker, length >> 8, length & 0xFF], data])
}

/** A JPEG as a phone writes one: JFIF, EXIF with GPS, XMP, an ICC profile, IPTC, a comment, then the scan. */
export function exifJpeg({ orientation = 6 } = {}): Uint8Array {
  return concat([
    [0xFF, 0xD8],
    segment(0xE0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    segment(0xE1, concat([[...ascii('Exif'), 0, 0], exifTiff(orientation)])),
    segment(0xE1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>')),
    segment(0xE2, ascii('ICC_PROFILE\0\x01\x01profile')),
    segment(0xED, ascii('Photoshop 3.0\0IPTC caption')),
    segment(0xFE, ascii('taken at home')),
    segment(0xDB, Array.from({ length: 65 }, () => 1)),
    segment(0xDA, [1, 1, 0, 0, 0x3F, 0]),
    [0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xFF, 0xD9],
  ])
}

/** The markers of a JPEG's segments, up to and including its scan. */
export function jpegSegments(bytes: Uint8Array): string[] {
  const markers: string[] = []
  let at = 2
  while (at + 4 <= bytes.length) {
    const marker = bytes[at + 1]!
    markers.push(marker.toString(16).toUpperCase())
    if (marker === 0xDA) break
    at += 2 + ((bytes[at + 2]! << 8) | bytes[at + 3]!)
  }
  return markers
}

/** The orientation a JPEG's EXIF block holds, or `undefined`. */
export function orientationOf(bytes: Uint8Array): number | undefined {
  let at = 2
  while (at + 4 <= bytes.length && bytes[at + 1] !== 0xDA) {
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!
    if (bytes[at + 1] === 0xE1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'Exif') {
      const tiff = bytes.subarray(at + 10, at + 2 + length)
      const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
      const little = tiff[0] === 0x49
      const ifd = view.getUint32(4, little)
      for (let index = 0; index < view.getUint16(ifd, little); index++) {
        const entry = ifd + 2 + index * 12
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
      }
    }
    at += 2 + length
  }
  return undefined
}

/** A PNG chunk; the checksum is a stand-in, which nothing here verifies. */
function chunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.length)
  return concat([length, ascii(type), data, [0, 0, 0, 0]])
}

/** A PNG with an ICC profile, EXIF, text and XMP chunks and an edit time. */
export function gpsPng(): Uint8Array {
  return concat([
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    chunk('iCCP', ascii('profile\0\0x')),
    chunk('eXIf', exifTiff(1)),
    chunk('tEXt', ascii('Location\0GPS52N')),
    chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')),
    chunk('tIME', [7, 234, 10, 27, 12, 0, 0]),
    chunk('IDAT', [1, 2, 3]),
    chunk('IEND', []),
  ])
}

/** The chunk types of a PNG. */
export function pngChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const types: string[] = []
  for (let at = 8; at + 12 <= bytes.length; at += 12 + view.getUint32(at)) types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)))
  return types
}

/** A RIFF chunk, padded to an even size. */
function riff(type: string, data: Uint8Array | number[]): Uint8Array {
  const header = new Uint8Array(8)
  header.set(ascii(type))
  new DataView(header.buffer).setUint32(4, data.length, true)
  return concat([header, data, data.length % 2 ? [0] : []])
}

/** An extended WebP with EXIF (GPS) and XMP chunks, their flags set. */
export function gpsWebp(): Uint8Array {
  const body = concat([
    riff('VP8X', [0x0C, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    riff('VP8L', [0x2F, 0, 0, 0, 0]),
    riff('EXIF', exifTiff(1)),
    riff('XMP ', ascii('<x:xmpmeta>GPS</x:xmpmeta>')),
  ])
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'))
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  header.set(ascii('WEBP'), 8)
  return concat([header, body])
}

/** The chunk types of a WebP. */
export function webpChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const types: string[] = []
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true)
    types.push(String.fromCharCode(...bytes.subarray(at, at + 4)))
    at += 8 + size + (size % 2)
  }
  return types
}
