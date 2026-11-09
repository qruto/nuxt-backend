import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent, h, ref } from 'vue'
import { clearNuxtData, useRuntimeConfig } from '#imports'
import { HEALTH_ROUTE } from '../../src/convex/constants'
import { LABELS } from '../../src/convex/labels'
import { BROWSER_STORAGE } from '../../src/convex/legal'
import { coolDown, coolingDown } from '../../src/runtime/vue/components/billing/upgrade-prompt'
import LegalContactPoints from '../../src/runtime/vue/components/shell/LegalContactPoints.vue'
import LegalDetail from '../../src/runtime/vue/components/shell/LegalDetail.vue'
import LegalDocument from '../../src/runtime/vue/components/shell/LegalDocument.vue'
import LegalProcessors from '../../src/runtime/vue/components/shell/LegalProcessors.vue'
import LegalStorage from '../../src/runtime/vue/components/shell/LegalStorage.vue'
import { useLegalDocument } from '../../src/runtime/vue/components/shell/legal'
import { registerComponents } from '../helpers/register-components'

// The packaged legal pages (LEGAL): filled from appConfig.backend.legal and
// the capabilities the app's health route reports, each under the "not
// legal advice" note. A capability that is `missing` drops its rows, its
// processor and its stored items; a health route that cannot be read
// leaves every capability in.

// The pages render the public tables by name, as an app's same-named component would replace them.
await registerComponents('LegalProcessors', 'LegalStorage', 'LegalDetail', 'LegalVersion', 'LegalContactPoints', 'LegalModeration')

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

describe('the operator\'s details and rows of its own', () => {
  it('names the registration number, the VAT line and the consumer mediator', async () => {
    appConfig.backend = { ...appConfig.backend, legal: { company: 'Panels Studio EI', address: '1 rue Example, Paris', contact: 'support@panels.example', registration: 'SIREN 123 456 789', vat: 'VAT not applicable, art. 293 B of the CGI', mediator: { name: 'Example Mediation', url: 'https://mediation.example' } } }
    const privacy = await mountSuspended(LegalDocument, { props: { page: 'privacy' } })
    expect(privacy.find('[data-legal="controller"]').text()).toContain('Registration number: SIREN 123 456 789')
    expect(privacy.find('[data-legal="controller"]').text()).toContain('VAT: VAT not applicable, art. 293 B of the CGI')
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(terms.text()).toContain('SIREN 123 456 789')
    expect(terms.find('[data-legal="mediator"]').text()).toContain(LABELS.legal.terms.disputes)
    expect(terms.find('[data-legal="mediator"] a').attributes('href')).toBe('https://mediation.example')
  })

  it('names the points of contact the Digital Services Act asks for, and how content is moderated', async () => {
    appConfig.backend = { ...appConfig.backend, legal: {
      company: 'Panels Studio Ltd',
      contact: 'support@panels.example',
      contactPoints: { authorities: 'dsa@panels.example', languages: ['en', 'fr'] },
      moderation: [{ name: 'Llama Guard', checks: 'Photos and titles, as they are added.', decides: true }],
    } }
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(terms.find('[data-audience="authorities"] a').attributes('href')).toBe('mailto:dsa@panels.example')
    // The users' point is the contact, which the Contact section names once, in its sentence.
    expect(terms.find('[data-audience="users"]').exists()).toBe(false)
    expect(terms.text().split('support@panels.example')).toHaveLength(2)
    expect(terms.find('[data-audience="languages"] dd').text()).toBe('English, French')
    expect(terms.find('[data-legal="moderation-review"]').text()).toBe(LABELS.legal.moderation.review)
    const tool = terms.find('[data-legal="tool"]')
    expect(tool.attributes('data-decides')).toBe('alone')
    expect(tool.find('[data-legal="decides"]').text()).toBe(LABELS.legal.moderation.decidesAlone)
  })

  it('lists the users\' point once the app names one apart from the contact', async () => {
    appConfig.backend = { ...appConfig.backend, legal: { contact: 'support@panels.example', contactPoints: { users: 'help@panels.example' } } }
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(terms.find('[data-audience="users"] a').attributes('href')).toBe('mailto:help@panels.example')
  })

  it('takes the contact as the users\' point a Content page lists while that point is blank', async () => {
    appConfig.backend = { ...appConfig.backend, legal: { contact: 'support@panels.example', contactPoints: { authorities: 'dsa@panels.example', users: '  ' } } }
    const points = await mountSuspended(LegalContactPoints)
    expect(points.find('[data-audience="users"] a').attributes('href')).toBe('mailto:support@panels.example')
    expect(points.find('[data-audience="authorities"] a').attributes('href')).toBe('mailto:dsa@panels.example')
  })

  it('claims no moderation process while the app takes no reports', async () => {
    const config = useRuntimeConfig().public as { backend?: { pages?: Record<string, unknown> } }
    const previous = config.backend
    config.backend = { ...previous, pages: { ...previous?.pages, report: false } }
    try {
      const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
      expect(terms.text()).not.toContain(LABELS.legal.moderation.title)
    }
    finally {
      config.backend = previous
    }
  })

  it('names the DSA contacts still unset, for the development note of a terms page that takes reports', async () => {
    const Missing = defineComponent({ setup: () => {
      const legal = useLegalDocument('terms', ref(null))
      return () => h('p', legal.missing.value.join(','))
    } })
    appConfig.backend = { ...appConfig.backend, legal: { company: 'Panels Studio Ltd', address: '1 Example Street', contact: 'support@panels.example' } }
    expect((await mountSuspended(Missing)).text()).toBe('contactPoints.authorities,contactPoints.languages')
    appConfig.backend = { ...appConfig.backend, legal: { company: 'Panels Studio Ltd', address: '1 Example Street', contact: 'support@panels.example', contactPoints: { authorities: 'dsa@panels.example', languages: ['fr'] } } }
    expect((await mountSuspended(Missing)).text()).toBe('')
  })

  it('names what a French legal notice asks for: phone, share capital, publication director and the host', async () => {
    appConfig.backend = { ...appConfig.backend, legal: {
      company: 'Panels Studio SAS',
      phone: '+33 1 23 45 67 89',
      capital: '1 000 EUR',
      director: 'Ada Lovelace',
      host: { name: 'Vercel Inc.', address: '440 N Barranca Ave #4133, Covina, CA 91723, USA', phone: '+1 951-383-6898' },
    } }
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    const company = terms.find('[data-legal="controller"]').text()
    expect(company).toContain('Phone: +33 1 23 45 67 89')
    expect(company).toContain('Share capital: 1 000 EUR')
    expect(company).toContain('Publication director: Ada Lovelace')
    expect(company).toContain('Host: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA, +1 951-383-6898')
    const phone = await mountSuspended(LegalDetail, { props: { field: 'phone' } })
    expect(phone.find('a').attributes('href')).toBe('tel:+33123456789')
    expect((await mountSuspended(LegalDetail, { props: { field: 'host' } })).text()).toContain('Vercel Inc.')
  })

  it('says a person decides even with no automated tool named', async () => {
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(terms.text()).toContain(LABELS.legal.moderation.review)
    expect(terms.find('[data-legal="moderation-table"]').exists()).toBe(false)
  })

  it('leaves Disputes out while no mediator is named', async () => {
    const terms = await mountSuspended(LegalDocument, { props: { page: 'terms' } })
    expect(terms.text()).not.toContain(LABELS.legal.terms.disputesTitle)
  })

  it('lists the app\'s own processors and stored items after the package\'s, and a processor where the app says it keeps the data', async () => {
    appConfig.backend = { ...appConfig.backend, legal: {
      company: 'Panels Studio Ltd',
      locations: { deployment: 'The United States.' },
      processors: [{ name: 'Google (Gemini)', processes: 'Draws the panels from your photos.', location: 'The United States.' }],
      storage: [{ name: 'sound-enabled', kind: 'cookie', why: 'Remembers your sound setting.', lasts: '1 year.' }],
    } }
    const processors = await mountSuspended(LegalProcessors)
    expect(processors.attributes('data-backend')).toBe('')
    expect(processors.find('[data-processor="deployment"] [data-legal="location"]').text()).toBe('The United States.')
    const own = processors.find('[data-processor="own:0"]')
    expect(own.find('th').text()).toBe('Google (Gemini)')
    expect(own.find('[data-legal="processes"]').text()).toBe('Draws the panels from your photos.')
    expect(own.find('a').exists()).toBe(false)
    const storage = await mountSuspended(LegalStorage)
    const item = storage.find('[data-storage="own:0"]')
    expect(item.find('code').text()).toBe('sound-enabled')
    expect(item.attributes('data-consent')).toBe('necessary')
    expect(item.find('[data-legal="lasts"]').text()).toBe('1 year.')
  })

  it('prints one detail inside a sentence, the contact as a link, and nothing for an unset one', async () => {
    const contact = await mountSuspended(LegalDetail, { props: { field: 'contact' } })
    expect(contact.find('a').attributes('href')).toBe('mailto:privacy@panels.example')
    expect(contact.text()).toBe('privacy@panels.example')
    const company = await mountSuspended(LegalDetail, { props: { field: 'company' } })
    expect(company.text()).toBe('Panels Studio Ltd')
    expect(company.find('a').exists()).toBe(false)
    const vat = await mountSuspended(LegalDetail, { props: { field: 'vat' } })
    expect(vat.html()).not.toContain('data-legal')
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
