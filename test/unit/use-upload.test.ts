import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import type { GenericId } from 'convex/values'
import { ref } from 'vue'
import { uploadFile } from '../../src/runtime/vue/composables/use-upload'
import type {
  GenerateUploadUrl,
  useUpload as useUploadReal,
} from '../../src/runtime/vue/composables/use-upload'
import type {
  GetStorageUrl,
  useStorageUrl as useStorageUrlReal,
} from '../../src/runtime/vue/composables/use-storage-url'
import { FakeXhr, installFakeXhr } from '../helpers/fake-xhr'

// ── uploadFile (runtime) ──────────────────────────────────────────────────────

describe('uploadFile', () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
    vi.restoreAllMocks()
  })

  it('resolves with the storage id and reports progress', async () => {
    restore = installFakeXhr()
    const onProgress = vi.fn()
    const file = new Blob(['hello'], { type: 'text/plain' })

    const promise = uploadFile({ url: 'https://example.convex.cloud/upload', file, onProgress })

    const xhr = FakeXhr.instances[0]!
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://example.convex.cloud/upload')
    expect(xhr.headers['Content-Type']).toBe('text/plain')
    expect(xhr.sentBody).toBe(file)

    xhr.emitProgress(50, 100)
    xhr.resolveWith('store_123')

    await expect(promise).resolves.toBe('store_123')
    expect(onProgress).toHaveBeenCalledWith(0.5)
    expect(onProgress).toHaveBeenLastCalledWith(1)
  })

  it('rejects on a non-2xx response', async () => {
    restore = installFakeXhr()
    const promise = uploadFile({ url: 'u', file: new Blob(['x']) })
    FakeXhr.instances[0]!.failWith(500, 'boom')
    await expect(promise).rejects.toThrow(/status 500/)
  })

  it('rejects on a transport error', async () => {
    restore = installFakeXhr()
    const promise = uploadFile({ url: 'u', file: new Blob(['x']) })
    FakeXhr.instances[0]!.networkError()
    await expect(promise).rejects.toThrow(/network error/i)
  })

  it('aborts when the signal fires', async () => {
    restore = installFakeXhr()
    const controller = new AbortController()
    const promise = uploadFile({ url: 'u', file: new Blob(['x']), signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow(/aborted/i)
    expect(FakeXhr.instances[0]!.aborted).toBe(true)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    restore = installFakeXhr()
    const controller = new AbortController()
    controller.abort()
    await expect(
      uploadFile({ url: 'u', file: new Blob(['x']), signal: controller.signal }),
    ).rejects.toThrow(/aborted/i)
    expect(FakeXhr.instances.length).toBe(0)
  })

  it('rejects outside the browser (no XMLHttpRequest)', async () => {
    // No installFakeXhr: the node unit environment has no XMLHttpRequest global.
    await expect(uploadFile({ url: 'u', file: new Blob(['x']) })).rejects.toThrow(/browser/i)
  })
})

// ── Types ─────────────────────────────────────────────────────────────────────

// Intentional noops, we're only testing types.
const useUpload = (() => {}) as unknown as typeof useUploadReal
const useStorageUrl = (() => {}) as unknown as typeof useStorageUrlReal

const generateUploadUrl = makeFunctionReference<'mutation', Record<string, never>, string>(
  'files:generateUploadUrl',
) as GenerateUploadUrl
const getUrl = makeFunctionReference<'query', { storageId: GenericId<'_storage'> }, string | null>(
  'files:getUrl',
) as GetStorageUrl

describe('useUpload types', () => {
  it('accepts a generateUploadUrl mutation and typed callbacks', () => {
    useUpload(generateUploadUrl)
    useUpload(generateUploadUrl, {
      onSuccess: (storageId) => {
        // storageId is assignable to a v.id('_storage') arg.
        const id: GenericId<'_storage'> = storageId
        void id
      },
    })

    // @ts-expect-error a query reference is not a generateUploadUrl mutation
    useUpload(getUrl)
  })
})

describe('useStorageUrl types', () => {
  it('accepts a static or reactive storage id', () => {
    useStorageUrl(getUrl, 'store_1')
    useStorageUrl(getUrl, ref<string | null>(null))
    useStorageUrl(getUrl, () => null)
    useStorageUrl(getUrl, undefined)
  })
})
