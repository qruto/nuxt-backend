import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { hideBaseBrandNames } from '../../src/nuxt/registry'
import { renamedComponent } from '../../src/runtime/vue/utils/renamed-component'

// The filter that keeps the base module's brand-named surface out of an app,
// driven the way Nuxt drives it: one `afterEach` listener, called with each
// hook's name and the arguments every handler already added to. The
// registration suite (test/module/registration.test.ts) runs it against a real
// Nuxt; this one reaches the shapes a real boot does not produce.

/** The base module's package directory, `/`-separated like kit's registrations. */
const baseRoot = dirname(createRequire(import.meta.url).resolve('nuxt-convex-module/package.json')).replaceAll('\\', '/')
const base = (file: string) => `${baseRoot}/dist/runtime/${file}`

type Listener = (event: { name: string, args: unknown[] }) => void

/** The `afterEach` listener `hideBaseBrandNames` installs. */
function installFilter(): Listener {
  let listener: Listener | undefined
  hideBaseBrandNames({ hooks: { afterEach: (fn: Listener) => {
    listener = fn
  } } } as unknown as Nuxt)
  return listener!
}

describe('hideBaseBrandNames', () => {
  it('hides every brand-named component of the base module, Clerk and Auth0 providers included', () => {
    const components = [
      { pascalName: 'ConvexImage', filePath: base('vue/components/convex-image.js') },
      { pascalName: 'ConvexProviderWithClerk', filePath: base('clerk/vue/index.js') },
      { pascalName: 'ConvexProviderWithAuth0', filePath: base('auth0/vue/index.js') },
      { pascalName: 'CheckoutLink', filePath: base('polar/vue/components.js') },
      { pascalName: 'CustomerPortalLink', filePath: base('polar/vue/components.js') },
      { pascalName: 'Authenticated', filePath: base('vue/auth/helpers.js') },
      { pascalName: 'StorageImage', filePath: base('vue/components/convex-image.js') },
    ]
    installFilter()({ name: 'components:extend', args: [components] })
    expect(components.map(component => component.pascalName)).toStrictEqual(['Authenticated', 'StorageImage'])
  })

  it('touches only the base module\'s package, not a file that sits under a directory of the same name', () => {
    const elsewhere = '/app/vendor/nuxt-convex-module'
    const components = [
      { pascalName: 'ConvexWidget', filePath: `${elsewhere}/convex-widget.vue` },
      // The development stand-in this package registers under the old name.
      { pascalName: 'ConvexImage', filePath: '/pkg/nuxt-backend/src/runtime/vue/components/renamed-storage-image.ts' },
    ]
    const imports = [{ name: 'useConvexWidget', from: `${elsewhere}/use-widget.ts` }, { name: 'useConvex', from: base('vue/client.js') }]
    const filter = installFilter()
    filter({ name: 'components:extend', args: [components] })
    filter({ name: 'imports:extend', args: [imports] })
    expect(components.map(component => component.pascalName)).toStrictEqual(['ConvexWidget', 'ConvexImage'])
    expect(imports.map(entry => entry.name)).toStrictEqual(['useConvexWidget'])
  })

  it('leaves an argument of an unexpected shape alone instead of rejecting the hook', () => {
    const filter = installFilter()
    for (const [name, arg] of [
      ['imports:extend', undefined],
      ['imports:extend', { not: 'a list' }],
      ['components:extend', null],
      ['app:resolve', {}],
      ['app:resolve', { middleware: 'convex-auth' }],
      ['nitro:config', {}],
      ['nitro:config', { imports: false }],
      ['nitro:config', { imports: { imports: 'none' } }],
    ] as const) {
      expect(() => filter({ name, args: [arg] }), `${name} ${JSON.stringify(arg)}`).not.toThrow()
    }
  })

  it('still filters the shapes it knows: middleware and Nitro imports', () => {
    const filter = installFilter()
    const app = { middleware: [{ name: 'convex-auth', path: base('better-auth/nuxt/middleware.js') }, { name: 'auth', path: base('better-auth/nuxt/middleware.js') }] }
    const nitro = { imports: { imports: [{ name: 'convexAuth', from: base('better-auth/nuxt/server.js') }, { name: 'convexAuth', as: 'backendAuth', from: base('better-auth/nuxt/server.js') }] } }
    filter({ name: 'app:resolve', args: [app] })
    filter({ name: 'nitro:config', args: [nitro] })
    expect(app.middleware.map(entry => entry.name)).toStrictEqual(['auth'])
    expect(nitro.imports.imports.map(entry => entry.as ?? entry.name)).toStrictEqual(['backendAuth'])
  })
})

describe('the development stand-ins under the hidden component names', () => {
  let warn: Mock<typeof console.warn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const Target = defineComponent({
    props: { src: { type: String, default: '' } },
    setup: (props, { slots, attrs }) => () => h('img', { 'src': props.src, 'data-alt': attrs.alt }, slots.default?.()),
  })

  it('renders the replacement with every prop, attribute and slot, and warns once naming it', async () => {
    const Old = renamedComponent('OldImage', 'NewImage', Target)
    const render = () => renderToString(createSSRApp({ render: () => h(Old, { src: '/a.png', alt: 'A' }, { default: () => 'caption' }) }))

    expect(await render()).toBe(await renderToString(createSSRApp({ render: () => h(Target, { src: '/a.png', alt: 'A' }, { default: () => 'caption' }) })))
    await render()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('<OldImage> is <NewImage> now')
  })

  it('stand in for <ConvexImage>, <CheckoutLink> and <CustomerPortalLink> under their own names', async () => {
    const { ConvexImage } = await import('../../src/runtime/vue/components/renamed-storage-image')
    const { CheckoutLink, CustomerPortalLink } = await import('../../src/runtime/vue/components/renamed-billing-links')
    expect([ConvexImage.name, CheckoutLink.name, CustomerPortalLink.name]).toStrictEqual(['ConvexImage', 'CheckoutLink', 'CustomerPortalLink'])
  })
})
