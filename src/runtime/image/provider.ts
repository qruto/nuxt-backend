// The `backend` image provider for @nuxt/image: a file URL a query returned
// (`storage.fileUrl`, or a signed URL), resized by the optimizer the host
// runs. Convex serves a file's original bytes with no transforms, so this
// provider hands the size and format to the app's default provider (Vercel's
// image optimization on Vercel, IPX in a Nitro server) with the URL as its
// source. The module registers it, and adds the deployment's file hosts to
// `image.domains`, when @nuxt/image is one of the app's modules.

/** One provider as @nuxt/image's runtime keeps it. */
interface ProviderEntry {
  setup: () => { getImage: (src: string, options: Record<string, unknown>, ctx: ImageContext) => { url: string } }
  defaults?: Record<string, unknown>
}

/** What @nuxt/image hands a provider: its options, the default provider's name among them. */
interface ImageContext {
  options: { provider?: string, providers: Record<string, ProviderEntry | undefined> }
}

/** This provider's name, as the module registers it. */
export const BACKEND_IMAGE_PROVIDER = 'backend'

/** The provider: a factory @nuxt/image calls once. */
export default () => ({
  getImage(src: string, options: Record<string, unknown>, ctx: ImageContext): { url: string } {
    const name = ctx.options.provider
    const entry = name && name !== BACKEND_IMAGE_PROVIDER ? ctx.options.providers[name] : undefined
    // A static build has no optimizer at runtime: the original URL.
    if (!entry || name === 'none' || name === 'ipxStatic') return { url: src }
    return entry.setup().getImage(src, { ...entry.defaults, ...options, modifiers: { ...(entry.defaults?.modifiers as object | undefined), ...(options.modifiers as object | undefined) } }, ctx)
  },
})
