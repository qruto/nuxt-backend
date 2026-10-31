import { describe, expect, it } from 'vitest'
import provider from '../../src/runtime/image/provider'
import { fileHosts, imageDependency } from '../../src/nuxt/image'

// The `backend` provider for @nuxt/image: a file URL from storage, resized by
// the optimizer the host runs, and the deployment's file hosts allowed.

const src = 'https://happy-otter-123.convex.cloud/api/storage/abc'

/** An image context whose default provider records what it was asked. */
function context(name: string | undefined) {
  const seen: Array<{ src: string, options: Record<string, unknown> }> = []
  const delegate = { setup: () => ({ getImage: (url: string, options: Record<string, unknown>) => (seen.push({ src: url, options }), { url: `/_ipx/w_${(options.modifiers as { width?: number }).width}/${url}` }) }), defaults: { modifiers: { quality: 80 } } }
  return { seen, ctx: { options: { provider: name, providers: name ? { [name]: delegate } : {} } } }
}

describe('the backend image provider', () => {
  it('hands the URL and the modifiers to the host\'s optimizer', () => {
    const { seen, ctx } = context('ipx')
    expect(provider().getImage(src, { modifiers: { width: 320, format: 'webp' } }, ctx)).toEqual({ url: `/_ipx/w_320/${src}` })
    expect(seen[0]!.options.modifiers).toEqual({ quality: 80, width: 320, format: 'webp' })
  })

  it('serves the original URL without an optimizer at runtime', () => {
    expect(provider().getImage(src, { modifiers: { width: 320 } }, context('ipxStatic').ctx)).toEqual({ url: src })
    expect(provider().getImage(src, { modifiers: {} }, context(undefined).ctx)).toEqual({ url: src })
  })

  it('allows the deployment\'s file hosts, and installs nothing itself', () => {
    expect(fileHosts(['https://happy-otter-123.convex.cloud', 'https://happy-otter-123.convex.site', undefined, 'not a url'])).toEqual(['happy-otter-123.convex.cloud', 'happy-otter-123.convex.site'])
    const dependency = imageDependency({ resolve: (path: string) => path } as never, ['https://happy-otter-123.convex.cloud'])
    expect(dependency['@nuxt/image']).toMatchObject({ optional: true, defaults: { providers: { backend: { provider: './runtime/image/provider' } }, domains: ['happy-otter-123.convex.cloud'] } })
  })
})
