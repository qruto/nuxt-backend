// The favicon set, rendered from the flat mark (`website/public/favicon.svg`)
// so it can be regenerated whenever the mark changes:
//
//   favicon-96x96.png / web-app-manifest-{192,512}x{192,512}.png
//       transparent corners — the manifest's `purpose: "any"` entries
//   web-app-manifest-512x512-maskable.png
//       the mark in the central 80 % of a full-bleed plate — `purpose: "maskable"`
//   apple-touch-icon.png
//       180 px, opaque full-bleed plate — iOS masks its own corners
//   favicon.ico
//       16 / 32 / 48 px PNG entries (PNG-in-ICO, the container RealFaviconGenerator emits)
//
// The scheme-aware `logo.svg` is deliberately NOT the source: its gradients and
// the tritium glow (feGaussianBlur) rasterise into mud at 16 px, and its
// prefers-color-scheme block would follow the build machine's setting.
//
// Deterministic: sharp writes no timestamps and the ICO container is assembled
// by hand, so running this twice leaves `git status` unchanged.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'

const publicDir = join(fileURLToPath(new URL('..', import.meta.url)), 'website', 'public')
const plate = '#26292e'
const native = 44

const source = readFileSync(join(publicDir, 'favicon.svg'), 'utf-8')
const nativeSize = ` width="${native}" height="${native}"`
if (!source.includes(nativeSize)) {
  console.error(`generate-icons: favicon.svg must declare${nativeSize} on its root element (that is what gets scaled).`)
  process.exit(1)
}

/** The mark scaled to `size` px — an SVG with explicit pixel dimensions, so librsvg renders it 1:1. */
const markAt = size => Buffer.from(source.replace(nativeSize, ` width="${size}" height="${size}"`))

const png = { compressionLevel: 9, adaptiveFiltering: true, palette: false }

const renderMark = size => sharp(markAt(size)).png(png).toBuffer()

const renderTouchIcon = size => sharp(markAt(size))
  .flatten({ background: plate })
  .removeAlpha()
  .png(png)
  .toBuffer()

async function renderMaskable(size) {
  // The maskable safe zone is the central 80 %; everything outside it may be cropped.
  const inner = Math.round(size * 0.8)
  const offset = Math.round((size - inner) / 2)
  return sharp({ create: { width: size, height: size, channels: 3, background: plate } })
    .composite([{ input: await renderMark(inner), left: offset, top: offset }])
    .png(png)
    .toBuffer()
}

/** An ICO container: ICONDIR header, one ICONDIRENTRY per image, then the PNG payloads. */
function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1: icon
  header.writeUInt16LE(entries.length, 4)

  let offset = header.length + 16 * entries.length
  const directory = entries.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // colour count: no palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...directory, ...entries.map(e => e.data)])
}

const outputs = [
  { file: 'favicon-96x96.png', size: 96, render: renderMark },
  { file: 'web-app-manifest-192x192.png', size: 192, render: renderMark },
  { file: 'web-app-manifest-512x512.png', size: 512, render: renderMark },
  { file: 'web-app-manifest-512x512-maskable.png', size: 512, render: renderMaskable },
  { file: 'apple-touch-icon.png', size: 180, render: renderTouchIcon },
]

for (const { file, size, render } of outputs) {
  const data = await render(size)
  const { width, height } = await sharp(data).metadata()
  if (width !== size || height !== size) {
    console.error(`generate-icons: ${file} rendered at ${width}×${height}, expected ${size}×${size}.`)
    process.exit(1)
  }
  writeFileSync(join(publicDir, file), data)
  console.log(`${file.padEnd(40)} ${String(size).padStart(3)}×${size}  ${String(data.length).padStart(6)} B`)
}

const icoSizes = [16, 32, 48]
const icoData = ico(await Promise.all(icoSizes.map(async size => ({ size, data: await renderMark(size) }))))
writeFileSync(join(publicDir, 'favicon.ico'), icoData)
console.log(`${'favicon.ico'.padEnd(40)} ${icoSizes.join('/')}  ${String(icoData.length).padStart(6)} B`)
