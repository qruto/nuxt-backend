import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { clearNuxtData } from '#imports'
import { HEALTH_ROUTE } from '../../src/convex/constants'
import { LABELS } from '../../src/convex/labels'
import { BROWSER_STORAGE } from '../../src/convex/legal'
import { coolDown, coolingDown } from '../../src/runtime/vue/components/billing/upgrade-prompt'
import LegalDocument from '../../src/runtime/vue/components/shell/LegalDocument.vue'

// The packaged legal pages (LEGAL): filled from appConfig.backend.legal and
// the capabilities the app's health route reports, each under the "not
// legal advice" note. A capability that is `missing` drops its rows, its
// processor and its stored items; a health route that cannot be read
// leaves every capability in.

let health: { status: string, capabilities: Record<string, string> } | null = null
registerEndpoint(HEALTH_ROUTE, () => health ?? { status: 'failing', capabilities: { data: 'failing' } })

const { appConfig } = vi.hoisted(() => ({ appConfig: { backend: {} as Record<string, unknown> } }))
mockNuxtImport('useAppConfig', () => () => appConfig)

beforeEach(() => {
  health = { status: 'degraded', capabilities: { auth: 'live', data: 'live', billing: 'missing', email: 'live', ai: 'missing', protection: 'live', monitoring: 'missing', hosting: 'live', jobs: 'live', notifications: 'live', flags: 'live' } }
  appConfig.backend = { brand: { name: 'Panels' }, legal: { company: 'Panels Studio Ltd', address: '1 Example Street, Dublin', contact: 'privacy@panels.example' } }
})

afterEach(() => {
  appConfig.backend = {}
  clearNuxtData('backend-legal-health')
})

describe('the privacy page', () => {
  it('names the company, says it is not legal advice, and lists what the app uses', async () => {
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'privacy' } })
    expect(wrapper.find('[data-legal="disclaimer"]').text()).toBe(LABELS.legal.disclaimer)
    expect(wrapper.text()).toContain('Panels is run by Panels Studio Ltd.')
    expect(wrapper.find('[data-legal="controller"]').text()).toContain('privacy@panels.example')

    const capabilities = wrapper.findAll('[data-legal="data-group"]').map(group => group.attributes('data-capability'))
    expect(capabilities).toContain('auth')
    expect(capabilities).toContain('email')
    expect(capabilities).not.toContain('billing')
    expect(wrapper.find('[data-participant="reports"]').text()).toContain('548 days')

    const processors = wrapper.findAll('[data-processor]').map(row => row.attributes('data-processor'))
    // Notifications are live: the browsers' push services are listed.
    expect(processors).toEqual(['deployment', 'host', 'email', 'botCheck', 'webPush'])
    const stored = wrapper.findAll('[data-storage]').map(row => row.attributes('data-storage'))
    expect(stored).toContain('visitor')
    expect(stored).not.toContain('replay')
    expect(stored).not.toContain('upgradeDismissed')
    expect(wrapper.find('[data-storage="visitor"]').text()).toContain('__Host-backend.visitor')
    expect(wrapper.find('[data-storage="pushSubscription"]').text()).toContain('/_backend/push/worker.js')
    expect(wrapper.find('[data-storage="pushSubscription"]').text()).toContain(LABELS.legal.kinds.push)
    expect(wrapper.find('[data-storage="lastSignIn"]').attributes('data-consent')).toBe('preferences')
  })

  it('lists every capability when the health route cannot reach the backend', async () => {
    health = null
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'privacy' } })
    expect(wrapper.findAll('[data-processor]').map(row => row.attributes('data-processor'))).toContain('billing')
    expect(wrapper.find('[data-storage="replay"]').exists()).toBe(true)
  })

  it('drops the disclaimer an app empties, and a detail it did not set', async () => {
    appConfig.backend = { legal: { company: 'Panels Studio Ltd' }, labels: { legal: { disclaimer: '' } } }
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'privacy' } })
    expect(wrapper.find('[data-legal="disclaimer"]').exists()).toBe(false)
    expect(wrapper.find('[data-legal="controller"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('this app is run by Panels Studio Ltd.')
    // The keys still unset show in development only (`import.meta.dev`), never here.
    expect(wrapper.find('[data-legal="unset"]').exists()).toBe(false)
  })
})

describe('the other legal pages', () => {
  it('terms leave out plans and AI while billing and AI are not in use', async () => {
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(wrapper.text()).not.toContain(LABELS.legal.terms.plansTitle)
    expect(wrapper.text()).not.toContain(LABELS.legal.terms.aiTitle)
    expect(wrapper.text()).toContain(LABELS.legal.terms.contentTitle)
    expect(wrapper.find('a[href="/report"]').exists()).toBe(true)
  })

  it('terms name the merchant of record while billing is in use', async () => {
    health!.capabilities.billing = 'live'
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(wrapper.text()).toContain('Polar sells our plans and credits to you as merchant of record')
    expect(wrapper.find('a[href="https://polar.sh/legal/checkout-buyer-terms"]').exists()).toBe(true)
  })

  it('the subprocessor list links each agreement it has', async () => {
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'subprocessors' } })
    expect(wrapper.find('[data-processor="deployment"] a').attributes('href')).toBe('https://www.convex.dev/legal/dpa')
    expect(wrapper.find('[data-processor="botCheck"] a').exists()).toBe(false)
    expect(wrapper.find('[data-legal="unset"]').exists()).toBe(false)
  })

  it('names the app\'s own host in place of Vercel when app config sets one', async () => {
    appConfig.backend = { ...appConfig.backend, legal: { company: 'Panels Studio Ltd', host: { name: 'Example Cloud', location: 'Frankfurt, Germany.', agreement: 'https://cloud.example/dpa' } } }
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'subprocessors' } })
    const row = wrapper.find('[data-processor="host"]')
    expect(row.find('th').text()).toBe('Example Cloud')
    expect(row.text()).toContain('Frankfurt, Germany.')
    expect(row.find('a').attributes('href')).toBe('https://cloud.example/dpa')
    expect(wrapper.text()).not.toContain('Vercel is a US company')
  })

  it('keeps Vercel\'s row while the host has no name or location', async () => {
    appConfig.backend = { ...appConfig.backend, legal: { company: 'Panels Studio Ltd', host: { name: 'Example Cloud' } } }
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'subprocessors' } })
    expect(wrapper.find('[data-processor="host"] th').text()).toBe('Vercel')
  })

  it('the accessibility statement asks for barriers at the contact, and links the other pages', async () => {
    const wrapper = await mountSuspended(LegalDocument, { props: { page: 'accessibility' } })
    expect(wrapper.text()).toContain('Tell us at privacy@panels.example what you tried to do')
    expect(wrapper.findAll('[data-legal="links"] a').map(link => link.attributes('href'))).toEqual(['/legal/privacy', '/legal/terms', '/legal/subprocessors'])
  })
})

describe('a dismissed upgrade prompt', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = 'backend.storage=; Max-Age=0; Path=/'
  })

  it('is kept for the tab alone until the person allows preferences, as the privacy page says', () => {
    expect(BROWSER_STORAGE.upgradeDismissed.consent).toBe('preferences')
    coolDown('hd_export', 1000)
    expect(sessionStorage.getItem(BROWSER_STORAGE.upgradeDismissed.name)).toContain('hd_export')
    expect(localStorage.getItem(BROWSER_STORAGE.upgradeDismissed.name)).toBeNull()
    expect(coolingDown('hd_export', 5000, 2000)).toBe(true)

    document.cookie = 'backend.storage=preferences; Path=/'
    coolDown('ai_video', 1000)
    expect(localStorage.getItem(BROWSER_STORAGE.upgradeDismissed.name)).toContain('ai_video')
    expect(coolingDown('ai_video', 5000, 2000)).toBe(true)
    expect(coolingDown('ai_video', 500, 2000)).toBe(false)
  })
})
