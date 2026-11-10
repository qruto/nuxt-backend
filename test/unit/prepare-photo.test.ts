import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import type { Nuxt } from '@nuxt/schema'
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBackendError } from '../../src/convex/errors'
import { heicDecoderInstalled, registerPhotoDecoder } from '../../src/nuxt/photos'
import { isPhotoFile, PhotoPrepError, preparePhoto } from '../../src/runtime/vue/composables/prepare-photo'

// preparePhoto with the browser's image APIs stood in for: what it asks the
// decoders for, what it draws and at what size, what it encodes, and how a
// photo it can't open is refused. Node has Blob, File and AbortSignal; the
// canvas, the bitmap decoder and <img> are fakes that record their calls.

// The build preparePhoto imports: a mock of `heic-to` itself would leave
// these tests on the real decoder, which needs a browser.
const heicTo = vi.hoisted(() => vi.fn())
vi.mock('heic-to/csp', () => ({ heicTo }))

const addNitroPlugin = vi.hoisted(() => vi.fn())
vi.mock('@nuxt/kit', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), addNitroPlugin }))

interface Drawn { width: number, height: number, fill: string | null, drew: unknown, encoded: { type?: string, quality?: number } | null }

/** Every canvas made, with what was drawn on it and how it was encoded. */
let canvases: Drawn[] = []

function context(drawn: Drawn) {
  return {
    imageSmoothingQuality: 'low',
    fillStyle: '',
    fillRect(this: { fillStyle: string }) {
      drawn.fill = this.fillStyle
    },
    drawImage: (source: unknown, _x: number, _y: number, width: number, height: number) => {
      drawn.drew = source
      expect([width, height]).toEqual([drawn.width, drawn.height])
    },
  }
}

class FakeOffscreenCanvas {
  readonly drawn: Drawn
  constructor(width: number, height: number) {
    this.drawn = { width, height, fill: null, drew: null, encoded: null }
    canvases.push(this.drawn)
  }

  getContext() {
    return context(this.drawn)
  }

  async convertToBlob(options: { type?: string, quality?: number }) {
    this.drawn.encoded = options
    return new Blob(['pixels'], { type: options.type })
  }
}

/** The browser's FileReader, reading a file as a `data:` URL. */
class FakeFileReader {
  result: string | null = null
  error: DOMException | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(file: Blob) {
    void file.arrayBuffer().then((bytes) => {
      this.result = `data:${file.type || 'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`
      this.onload?.()
    })
  }
}

/** A decoded bitmap of a size, as `createImageBitmap` hands one back. */
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() })

const jpeg = (name = 'photo.jpg') => new File([new Uint8Array([0xFF, 0xD8, 0xFF])], name, { type: 'image/jpeg' })

beforeEach(() => {
  canvases = []
  heicTo.mockReset()
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  vi.stubGlobal('FileReader', FakeFileReader)
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(4000, 3000)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preparePhoto', () => {
  it('turns a photo upright, scales its long edge down and sends a JPEG of its pixels alone', async () => {
    const decoded = bitmap(4000, 3000)
    vi.mocked(createImageBitmap).mockResolvedValueOnce(decoded as never)
    const blob = await preparePhoto(jpeg())

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' })
    expect(canvases).toEqual([{ width: 2048, height: 1536, fill: '#fff', drew: decoded, encoded: { type: 'image/jpeg', quality: 0.85 } }])
    expect(blob.type).toBe('image/jpeg')
    expect(decoded.close).toHaveBeenCalled()
    // The decoder for HEIC is loaded only for one.
    expect(heicTo).not.toHaveBeenCalled()
  })

  it('keeps a smaller photo\'s size, and takes the long edge, the type and the quality it is given', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce(bitmap(800, 1200) as never)
    await preparePhoto(jpeg(), { longEdge: 1536, type: 'image/webp', quality: 0.7 })
    vi.mocked(createImageBitmap).mockResolvedValueOnce(bitmap(1200, 3000) as never)
    await preparePhoto(jpeg(), { longEdge: 1536, type: 'image/png' })
    expect(canvases).toEqual([
      { width: 800, height: 1200, fill: null, drew: expect.anything(), encoded: { type: 'image/webp', quality: 0.7 } },
      { width: 614, height: 1536, fill: null, drew: expect.anything(), encoded: { type: 'image/png', quality: 0.85 } },
    ])
  })

  it('sends a JPEG where the browser has no WebP encoder, never the PNG its canvas answers instead', async () => {
    // Safari's canvas: asked for WebP, it writes a PNG.
    vi.stubGlobal('OffscreenCanvas', class extends FakeOffscreenCanvas {
      override async convertToBlob(options: { type?: string, quality?: number }) {
        const blob = await super.convertToBlob(options)
        return options.type === 'image/webp' ? new Blob([blob], { type: 'image/png' }) : blob
      }
    })
    const decoded = bitmap(800, 1200)
    vi.mocked(createImageBitmap).mockResolvedValueOnce(decoded as never)
    const blob = await preparePhoto(jpeg(), { type: 'image/webp', quality: 0.7 })
    expect(blob.type).toBe('image/jpeg')
    expect(canvases).toEqual([
      { width: 800, height: 1200, fill: null, drew: decoded, encoded: { type: 'image/webp', quality: 0.7 } },
      { width: 800, height: 1200, fill: '#fff', drew: decoded, encoded: { type: 'image/jpeg', quality: 0.7 } },
    ])
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it('refuses a file that is no picture as the catalog\'s invalid_input, a ConvexError the upload queues read as refused', async () => {
    const error = await preparePhoto(new File(['%PDF-1.7'], 'menu.pdf', { type: 'application/pdf' })).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(PhotoPrepError)
    expect(error).toBeInstanceOf(ConvexError)
    expect((error as PhotoPrepError).reason).toBe('unsupported_type')
    expect(getBackendError(error)).toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'unsupported_type' }, message: 'That type of file isn\'t accepted. Pick another one.' })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('opens a HEIC this browser can\'t with the decoder, loaded then, upright', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException('The source image could not be decoded.', 'InvalidStateError'))
    const decoded = bitmap(3024, 4032)
    heicTo.mockResolvedValueOnce(decoded)
    // An iPhone photo the device sent with no type: its name says HEIC.
    const photo = new File([new Uint8Array([0, 0, 0, 24])], 'IMG_0001.HEIC', { type: '' })
    const blob = await preparePhoto(photo)

    expect(heicTo).toHaveBeenCalledWith({ blob: photo, type: 'bitmap', options: { imageOrientation: 'from-image' } })
    expect(canvases).toEqual([expect.objectContaining({ width: 1536, height: 2048, drew: decoded })])
    expect(blob.type).toBe('image/jpeg')
    expect(decoded.close).toHaveBeenCalled()
  })

  it('refuses a HEIC the decoder can\'t open, or that no decoder is installed for, as unreadable', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new DOMException('no', 'InvalidStateError'))
    heicTo.mockRejectedValueOnce(new Error('heic-to is not installed'))
    const heic = new File([new Uint8Array([0])], 'photo.heic', { type: 'image/heic' })
    const error = await preparePhoto(heic).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(PhotoPrepError)
    expect(getBackendError(error)).toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'unreadable' }, message: 'This photo won\'t open here. Try a JPEG or PNG.' })
    expect((error as Error).cause).toEqual(new Error('heic-to is not installed'))
  })

  it('stops a HEIC the decoder is still on when the upload is canceled, and lets go of a bitmap that comes late', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException('no', 'InvalidStateError'))
    let answer!: (bitmap: unknown) => void
    heicTo.mockReturnValueOnce(new Promise((resolve) => {
      answer = resolve
    }))
    const controller = new AbortController()
    const preparing = preparePhoto(new File([new Uint8Array([0])], 'photo.heic', { type: 'image/heic' }), controller.signal)
    await vi.waitFor(() => expect(heicTo).toHaveBeenCalled())
    controller.abort(new DOMException('Canceled', 'AbortError'))
    await expect(preparing).rejects.toMatchObject({ name: 'AbortError' })

    const late = bitmap(3024, 4032)
    answer(late)
    await vi.waitFor(() => expect(late.close).toHaveBeenCalled())
    expect(canvases).toEqual([])
  })

  it('refuses a HEIC as unreadable once the decoder has not answered for a minute, as one whose worker never started', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(createImageBitmap).mockRejectedValue(new DOMException('no', 'InvalidStateError'))
      heicTo.mockReturnValue(new Promise(() => {}))
      const preparing = preparePhoto(new File([new Uint8Array([0])], 'photo.heic', { type: 'image/heic' })).catch((failure: unknown) => failure)
      await vi.waitFor(() => expect(heicTo).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(60_000)
      const error = await preparing
      expect(error).toBeInstanceOf(PhotoPrepError)
      expect(error).toMatchObject({ reason: 'unreadable', cause: { name: 'TimeoutError' } })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('falls back to an <img> where the bitmap decoder can\'t open a photo, loaded from a data: URL the security headers allow', async () => {
    // Chrome before 112 and Safari 15 refuse 'from-image' as an imageOrientation.
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new TypeError('imageOrientation is not supported'))
    const image = { naturalWidth: 3000, naturalHeight: 3000, decoding: '', src: '', decode: vi.fn(async () => {}) }
    vi.stubGlobal('Image', function FakeImage() {
      return image
    })
    const objectUrl = vi.spyOn(URL, 'createObjectURL')

    await preparePhoto(jpeg())
    // img-src is 'self' data: and the deployment's origins: a blob: URL would never load.
    expect(image.src).toBe(`data:image/jpeg;base64,${Buffer.from([0xFF, 0xD8, 0xFF]).toString('base64')}`)
    expect(objectUrl).not.toHaveBeenCalled()
    objectUrl.mockRestore()
    expect(canvases).toEqual([expect.objectContaining({ width: 2048, height: 2048, drew: image })])
  })

  it('refuses a photo that neither decoder opens as unreadable', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException('no', 'InvalidStateError'))
    vi.stubGlobal('Image', function FakeImage() {
      return { decode: async () => Promise.reject(new DOMException('no', 'EncodingError')) }
    })
    await expect(preparePhoto(jpeg())).rejects.toMatchObject({ reason: 'unreadable' })
  })

  it('encodes on a <canvas> where there is no OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const drawn: Drawn = { width: 0, height: 0, fill: null, drew: null, encoded: null }
    const canvas = {
      set width(value: number) {
        drawn.width = value
      },
      set height(value: number) {
        drawn.height = value
      },
      getContext: () => context(drawn),
      toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
        drawn.encoded = { type, quality }
        done(new Blob(['pixels'], { type }))
      },
    }
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) })
    const blob = await preparePhoto(jpeg())
    expect(drawn).toMatchObject({ width: 2048, height: 1536, fill: '#fff', encoded: { type: 'image/jpeg', quality: 0.85 } })
    expect(blob.type).toBe('image/jpeg')
  })

  it('takes the abort signal alone as its second argument, as useUploadField hands it, and stops with its reason', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('Canceled', 'AbortError'))
    await expect(preparePhoto(jpeg(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(preparePhoto(jpeg(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(createImageBitmap).not.toHaveBeenCalled()

    const live = new AbortController()
    expect((await preparePhoto(jpeg(), live.signal)).type).toBe('image/jpeg')
  })

  it('stops after decoding when the upload is canceled meanwhile, and lets go of the bitmap', async () => {
    const controller = new AbortController()
    const decoded = bitmap(100, 100)
    vi.mocked(createImageBitmap).mockImplementationOnce(async () => {
      controller.abort(new DOMException('Canceled', 'AbortError'))
      return decoded as never
    })
    await expect(preparePhoto(jpeg(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(canvases).toEqual([])
    expect(decoded.close).toHaveBeenCalled()
  })

  it('throws a TypeError, never a refusal, for options that are wrong', async () => {
    await expect(preparePhoto(jpeg(), { longEdge: 0 })).rejects.toThrow(TypeError)
    await expect(preparePhoto(jpeg(), { longEdge: 10.5 })).rejects.toThrow(/whole number of pixels/)
    await expect(preparePhoto(jpeg(), { quality: 2 })).rejects.toThrow(/quality is from 0 to 1/)
    await expect(preparePhoto(jpeg(), { type: 'image/gif' as never })).rejects.toThrow(/type is 'image\/jpeg'/)
  })
})

describe('isPhotoFile', () => {
  it('admits an image type, and a HEIC the device sent untyped', () => {
    expect(isPhotoFile(new File([''], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isPhotoFile(new File([''], 'IMG_0001.HEIC', { type: '' }))).toBe(true)
    expect(isPhotoFile(new File([''], 'IMG_0002.heif', { type: 'application/octet-stream' }))).toBe(true)
    expect(isPhotoFile(new Blob([''], { type: 'image/heic' }))).toBe(true)
    expect(isPhotoFile(new File([''], 'notes.txt', { type: 'text/plain' }))).toBe(false)
    expect(isPhotoFile(new Blob(['']))).toBe(false)
  })
})

describe('the HEIC decoder, an optional peer', () => {
  it('is found where the app installed it, and not elsewhere', () => {
    expect(heicDecoderInstalled(process.cwd())).toBe(true)
    expect(heicDecoderInstalled(tmpdir())).toBe(false)
  })

  it('is a stand-in that refuses when it is absent, which preparePhoto reads as unreadable', async () => {
    const absent = await import('../../src/runtime/vue/utils/heic-absent')
    await expect(absent.heicTo({})).rejects.toThrow(/npm install heic-to/)
  })

  it('is heic-to\'s CSP build, which compiles nothing at runtime and needs only a worker from a blob: URL', () => {
    const require = createRequire(import.meta.url)
    const csp = readFileSync(require.resolve('heic-to/csp'), 'utf8')
    // No JavaScript from strings, which a script-src without 'unsafe-eval' refuses.
    expect(csp).not.toMatch(/new Function|\beval\(/)
    // And no WebAssembly, which would need 'wasm-unsafe-eval': libheif runs as JavaScript.
    expect(csp).not.toMatch(/WebAssembly/)
    expect(csp).toContain('isWasm2js:!0')
    // Its one need beyond the package's policy: blob: in worker-src.
    expect(csp).toContain('new Worker(URL.createObjectURL(')
    // The default build is the one a policy refuses.
    expect(readFileSync(require.resolve('heic-to'), 'utf8')).toMatch(/new Function/)
  })

  describe('registered with the app', () => {
    const resolver = { resolve: (path: string) => path.replace(/^\.\//, '/module/') }
    const app = (rootDir: string, security?: unknown) => ({ options: { rootDir, alias: {}, security } }) as unknown as Nuxt
    beforeEach(() => addNitroPlugin.mockClear())

    it('points the build at the stand-in where the app has not installed it, and touches no header', () => {
      const nuxt = app(tmpdir())
      registerPhotoDecoder(resolver as never, nuxt)
      expect(nuxt.options.alias).toEqual({ 'heic-to/csp': '/module/runtime/vue/utils/heic-absent' })
      expect(addNitroPlugin).not.toHaveBeenCalled()
    })

    it('lets its blob: worker through the security headers where the app installed it, unless the headers are off', () => {
      const nuxt = app(process.cwd())
      registerPhotoDecoder(resolver as never, nuxt)
      expect(nuxt.options.alias).toEqual({})
      const plugin = '/module/runtime/server/photo-decoder-csp'
      expect(addNitroPlugin).toHaveBeenCalledExactlyOnceWith({ nitro2: plugin, nitro3: plugin })

      addNitroPlugin.mockClear()
      registerPhotoDecoder(resolver as never, app(process.cwd(), false))
      expect(addNitroPlugin).not.toHaveBeenCalled()
    })
  })
})
