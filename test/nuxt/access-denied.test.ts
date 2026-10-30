import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRuntimeConfig } from '#imports'

// <AccessDenied> beyond the contract (test/nuxt/component-contract.test.ts):
// the words follow the rule the page guard names, the ways on follow who is
// signed in, and signing in as someone else comes back to the page asked for.

const authed = ref(true)
const signOut = vi.fn(async () => {})
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => ({
  isAuthenticated: computed(() => authed.value),
  user: computed(() => (authed.value ? { email: 'ada@example.com' } : null)),
  signOut,
}),
}))

const { navigateTo, clearError, error } = vi.hoisted(() => ({
  navigateTo: vi.fn(async () => {}),
  clearError: vi.fn(async () => {}),
  error: { value: undefined as unknown },
}))
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('clearError', () => clearError)
mockNuxtImport('useError', () => () => error)

const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AccessDenied')
const { default: AccessDenied } = await import('../../src/runtime/vue/components/shell/AccessDenied.vue')

beforeEach(() => {
  vi.clearAllMocks()
  authed.value = true
  error.value = undefined
  const config = useRuntimeConfig().public as Record<string, unknown>
  config.backend = { ...(config.backend as object), pages: { login: '/signin', settings: '/team/settings' }, redirects: { afterSignIn: '/app' } }
})

const denied = (reason: string, path = '/team/admin?tab=roles') => ({ statusCode: 403, data: { reason, path } })

describe('<AccessDenied>', () => {
  it('words the rule the person failed, and names who is signed in', () => {
    const text = (props: Record<string, unknown>) => mount(AccessDenied, { props }).find('[data-access="reason"]').text()
    expect(text({ error: denied('role') })).toContain('doesn\'t have the access this page needs')
    expect(text({ error: denied('workspace') })).toContain('Your role in this workspace')
    expect(text({ error: denied('banned') })).toBe('This account is banned.')
    // A 403 of the app's own, and the reason prop over the error's.
    expect(text({ error: { statusCode: 403 } })).toContain('doesn\'t have the access this page needs')
    expect(text({ error: denied('role'), reason: 'banned' })).toBe('This account is banned.')
    const wrapper = mount(AccessDenied, { props: { error: denied('role') } })
    expect(wrapper.find('h1').text()).toBe('You don\'t have access to this page')
    expect(wrapper.find('[data-access="root"]').attributes('aria-labelledby')).toBe(wrapper.find('h1').attributes('id'))
    expect(wrapper.find('[data-access="account"]').text()).toBe('Signed in as ada@example.com.')
  })

  it('offers the home page, the workspace switcher for a workspace role, and another account', () => {
    const role = mount(AccessDenied, { props: { error: denied('role') } })
    expect(role.find('[data-access="home"]').attributes('href')).toBe('/app')
    expect(role.find('[data-access="switch-workspace"]').exists()).toBe(false)
    expect(role.find('[data-access="switch-account"]').exists()).toBe(true)

    const workspace = mount(AccessDenied, { props: { error: denied('workspace'), home: '/dashboard' } })
    expect(workspace.find('[data-access="home"]').attributes('href')).toBe('/dashboard')
    expect(workspace.find('[data-access="switch-workspace"]').attributes('href')).toBe('/team/settings')
  })

  it('offers no account to leave when nobody is signed in', () => {
    authed.value = false
    const wrapper = mount(AccessDenied)
    expect(wrapper.find('[data-access="account"]').exists()).toBe(false)
    expect(wrapper.find('[data-access="switch-account"]').exists()).toBe(false)
    expect(wrapper.find('[data-access="home"]').exists()).toBe(true)
  })

  it('signs out, then sends the person to sign in with the way back to the page they asked for', async () => {
    error.value = denied('role')
    const wrapper = mount(AccessDenied, { props: { error: denied('role') } })
    await wrapper.find('[data-access="switch-account"]').trigger('click')
    await flushPromises()
    expect(signOut).toHaveBeenCalledOnce()
    expect(wrapper.emitted('signed-out')).toHaveLength(1)
    // Off the error page through clearError, which clears it.
    expect(clearError).toHaveBeenCalledWith({ redirect: '/signin?redirect=%2Fteam%2Fadmin%3Ftab%3Droles' })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('returns a 403 of the app\'s own to the page a server render failed at, never to another site', async () => {
    error.value = { statusCode: 403, url: '/billing?tab=invoices' }
    const own = mount(AccessDenied, { props: { error: error.value as object } })
    await own.find('[data-access="switch-account"]').trigger('click')
    await flushPromises()
    expect(clearError).toHaveBeenLastCalledWith({ redirect: '/signin?redirect=%2Fbilling%3Ftab%3Dinvoices' })

    const offSite = { statusCode: 403, url: '//evil.example/' }
    const elsewhere = mount(AccessDenied, { props: { error: offSite } })
    await elsewhere.find('[data-access="switch-account"]').trigger('click')
    await flushPromises()
    expect(clearError).toHaveBeenLastCalledWith({ redirect: expect.not.stringContaining('evil.example') })
  })

  it('stays put and says so when signing out fails', async () => {
    signOut.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(AccessDenied, { props: { error: denied('role') } })
    await wrapper.find('[data-access="switch-account"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-access="error"][role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('error')).toHaveLength(1)
    expect(wrapper.emitted('signed-out')).toBeUndefined()
    expect(clearError).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-access="switch-account"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('takes a plain click on a link through the router, and leaves a modified one to the browser', async () => {
    const wrapper = mount(AccessDenied, { props: { error: denied('workspace') } })
    await wrapper.find('[data-access="switch-workspace"]').trigger('click', { button: 0 })
    expect(navigateTo).toHaveBeenCalledWith('/team/settings')
    navigateTo.mockClear()
    await wrapper.find('[data-access="home"]').trigger('click', { button: 0, metaKey: true })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('moves focus to its heading as the error page, when the link that led here is gone, and only then', async () => {
    // Placed in a page, it leaves focus be.
    const placed = mount(AccessDenied, { attachTo: document.body })
    expect(document.activeElement).toBe(document.body)
    placed.unmount()

    error.value = denied('role')
    const dropped = mount(AccessDenied, { attachTo: document.body })
    expect(document.activeElement).toBe(dropped.find('h1').element)
    dropped.unmount()

    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    const kept = mount(AccessDenied, { attachTo: document.body })
    expect(document.activeElement).toBe(button)
    kept.unmount()
    button.remove()
  })

  it('fills each region from its slot, with the reason and the way back', () => {
    const wrapper = mount(AccessDenied, {
      props: { error: denied('workspace', '/team') },
      slots: {
        title: () => 'Owners only',
        message: ({ reason, path }: { reason?: string, path: string }) => h('p', { 'data-access': 'custom' }, `${reason} ${path}`),
        actions: ({ home }: { home: string }) => h('a', { 'data-access': 'custom-home', 'href': home }, 'Back'),
      },
    })
    expect(wrapper.find('h1').text()).toBe('Owners only')
    expect(wrapper.find('[data-access="custom"]').text()).toBe('workspace /team')
    expect(wrapper.find('[data-access="custom-home"]').attributes('href')).toBe('/app')
  })
})
