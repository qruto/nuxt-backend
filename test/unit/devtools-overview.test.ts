// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import * as vue from 'vue'
import { PANEL_TABS } from '../../devtools-client-app/app/nav'
import { createPanelStore } from '../../devtools-client-app/app/composables/store'
import * as signal from '../../devtools-client-app/app/utils/signal'
import * as rpcTypes from '../../src/devtools/rpc-types'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'
import * as health from '../../src/capabilities/health'
import { detectCapabilities, CAPABILITY_NAMES, type CapabilityName, type CapabilityState } from '../../src/capabilities'
import { finding } from '../../src/findings'
import { websiteComponent } from '../helpers/website-sfc'

// The Overview's capability console as a person meets it: a channel per capability,
// lit in its state's signal, a key to the capability's own tab where it has one,
// reachable and pressed from the keyboard, and a link to its docs. The
// panel's own parts (Led, SignalBadge, PanelCard) are compiled from their
// files, as the panel compiles them; only the DevTools UI kit is stood in.

const STATES: Record<CapabilityName, CapabilityState> = { auth: 'live', data: 'test', jobs: 'test', billing: 'missing', email: 'failing', notifications: 'test', ai: 'missing', protection: 'test', monitoring: 'test', flags: 'live', analytics: 'missing', hosting: 'missing' }

/** The kit's parts: a button (a link with `to`), and boxes that keep their slots and classes. */
const kit = {
  NButton: vue.defineComponent({
    props: { to: { type: String, default: undefined } },
    setup: (props, { slots }) => () => props.to ? vue.h('a', { href: props.to }, slots.default?.()) : vue.h('button', { type: 'button' }, slots.default?.()),
  }),
  ...Object.fromEntries(['NCard', 'NBadge', 'NTip', 'NPanelGrids', 'NLoading'].map(name => [name, vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', { 'data-kit': name }, slots.default?.()) })])),
}

function mountOverview(info: Partial<DevtoolsServerInfo> = {}) {
  const store = createPanelStore()
  const route = finding('email-webhook-route', 'fail', '/email/events is not mounted on the deployment.')
  const capabilities = detectCapabilities({ env: {}, deployed: null, deployment: 'local', findings: [route] }).map(capability => ({ ...capability, state: STATES[capability.name] }))
  store.state.info = {
    functionsDir: 'backend',
    options: { scaffold: true, autoEnv: true, authRoute: '/api/auth' },
    deployment: { kind: 'local', id: 'local:local-acme-app' },
    pages: [],
    findings: [],
    capabilities,
    doctorRanAt: null,
    env: { visible: { required: {}, optional: {} }, deployment: null },
    mcp: { route: '/mcp', exchangePath: '/mcp/exchange', tools: [], scopes: [] },
    versions: {},
    ...info,
  } as DevtoolsServerInfo
  const modules = { '~/utils/signal': signal }
  const parts = {
    Led: websiteComponent('devtools-client-app/app/components/Led.vue', {}, modules),
    SignalBadge: websiteComponent('devtools-client-app/app/components/SignalBadge.vue', {}, modules),
    PanelCard: websiteComponent('devtools-client-app/app/components/PanelCard.vue', {}),
  }
  const Overview = websiteComponent('devtools-client-app/app/components/panel/Overview.vue', {
    computed: vue.computed,
    ref: vue.ref,
    onMounted: vue.onMounted,
    usePanelState: () => store.state,
    usePanel: () => store,
    openConnectionTab: () => {},
    copyText: async () => {},
  }, {
    ...modules,
    '~/nav': { PANEL_TABS },
    '../../../../src/devtools/rpc-types': rpcTypes,
    '../../../../src/capabilities/health': health,
  })
  const wrapper = mount(Overview, { attachTo: document.body, global: { components: { ...kit, ...parts } } })
  return { store, wrapper }
}

const channel = (wrapper: ReturnType<typeof mountOverview>['wrapper'], name: CapabilityName) => wrapper.get(`[data-capability="${name}"]`)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the Overview\'s capability console', () => {
  it('shows one channel per capability, in console order, each named with its state', () => {
    const { wrapper } = mountOverview()
    const channels = wrapper.findAll('[data-capability]')
    expect(channels.map(each => each.attributes('data-capability'))).toEqual(CAPABILITY_NAMES)
    for (const each of channels) {
      const name = each.attributes('data-capability') as CapabilityName
      expect(each.attributes('data-state'), name).toBe(STATES[name])
      expect(each.attributes('aria-label'), name).toMatch(new RegExp(`: ${STATES[name]}$`))
    }
    expect(wrapper.text()).toContain('2 live · 5 test · 4 missing · 1 failing')
  })

  it('lights each channel in its state\'s signal: green live, amber test, grey missing, red failing', () => {
    const { wrapper } = mountOverview()
    for (const name of CAPABILITY_NAMES) {
      const lit = signal.layerSignal(STATES[name])
      expect(channel(wrapper, name).get('span[aria-hidden="true"]').classes(), name).toEqual(expect.arrayContaining(signal.SIGNAL_LED[lit].split(' ')))
      expect(channel(wrapper, name).get('[data-kit="NBadge"]').classes(), name).toContain(`n-${signal.SIGNAL_COLOR[lit]}`)
    }
    // A failing capability names the finding that failed it.
    expect(channel(wrapper, 'email').text()).toContain('Email webhook route')
  })

  it('offers a key to the capability\'s own tab where it has one, and a link to its docs', () => {
    const { wrapper, store } = mountOverview()
    for (const name of CAPABILITY_NAMES) {
      const capability = store.state.info!.capabilities.find(each => each.name === name)!
      const keys = channel(wrapper, name).findAll('button')
      if (capability.devtools === 'overview') expect(keys, name).toHaveLength(0)
      else expect(keys.map(key => key.text()), name).toEqual([PANEL_TABS.find(tab => tab.id === capability.devtools)!.label])
      expect(channel(wrapper, name).get('a').attributes('href'), name).toBe(capability.docsUrl)
    }
    expect(channel(wrapper, 'data').findAll('button')).toHaveLength(0)
    expect(channel(wrapper, 'jobs').findAll('button')).toHaveLength(0)
  })

  it('opens the capability\'s tab from the keyboard: the key takes focus, and pressing it switches the tab', async () => {
    const { wrapper, store } = mountOverview()
    const key = channel(wrapper, 'billing').get('button').element as HTMLButtonElement
    // A native button: in the tab order, and Enter or Space presses it.
    expect(key.tagName).toBe('BUTTON')
    expect(key.tabIndex).toBe(0)
    key.focus()
    expect(document.activeElement).toBe(key)
    key.click()
    await vue.nextTick()
    expect(store.state.tab).toBe('billing')
    expect(document.activeElement).toBe(key)
  })

  it('says what lights the channels: the dev-server checks, then the doctor run they read', async () => {
    const { wrapper, store } = mountOverview()
    expect(wrapper.text()).toContain('Lit from the dev-server checks')
    store.state.info = { ...store.state.info!, doctorRanAt: Date.UTC(2026, 9, 19, 9, 30) }
    await vue.nextTick()
    expect(wrapper.text()).not.toContain('Lit from the dev-server checks')
    expect(wrapper.text()).toContain('With doctor\'s checks from')
  })
})
