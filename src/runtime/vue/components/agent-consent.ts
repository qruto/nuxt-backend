import { defineComponent, h } from 'vue'
import { useAgentConsent, type AgentConsentRequest } from '../composables/use-agent-consent'

/**
 * What each scope lets an agent do, in the words the consent screen uses.
 * A scope the app added itself shows under its own name.
 */
export const AGENT_SCOPE_LABELS: Readonly<Record<string, string>> = {
  'openid': 'Confirm who you are',
  'profile': 'See your name and profile picture',
  'email': 'See your email address',
  'offline_access': 'Stay connected while you are away',
  'profile:write': 'Change your name',
  'billing:read': 'See your plan, credits and orders',
  'billing:checkout': 'Create checkout and billing links for you to open',
  'workspace:read': 'See your workspaces and their members',
}

/**
 * The consent screen for an agent's authorization: who is asking (the name
 * the agent gave itself, always marked unverified), where approving sends
 * the browser, and every scope it asked for, then Approve or Deny. Both
 * answers return the browser to the agent.
 *
 * The Nuxt module registers a ready-made page rendering this component
 * (module option `pages.agentConsent`, `/oauth/consent` by default), where
 * the OAuth provider sends every authorization. Headless like `AuthForm`:
 * semantic markup with `data-consent` attributes for styling, or replace any
 * state through its slot.
 *
 * @example
 * ```vue
 * <AgentConsent @answered="approved => track(approved)" />
 * ```
 */
export const AgentConsent = /* @__PURE__ */ defineComponent({
  name: 'AgentConsent',
  emits: {
    answered: (_approved: boolean) => true,
    error: (_message: string) => true,
  },
  setup(_, { slots, emit }) {
    const consent = useAgentConsent()

    const run = async (approve: boolean): Promise<void> => {
      if (consent.isPending.value) return
      try {
        await (approve ? consent.approve() : consent.deny())
        emit('answered', approve)
      }
      catch {
        emit('error', consent.error.value ?? 'Request failed')
      }
    }

    const slotContext = () => ({
      request: consent.request.value,
      approve: () => run(true),
      deny: () => run(false),
      pending: consent.isPending.value,
      error: consent.error.value,
    })

    const scopeList = (request: AgentConsentRequest) => h('ul', { 'data-consent': 'scopes' }, request.scopes.map(scope =>
      h('li', { 'data-consent': 'scope', 'data-scope': scope }, AGENT_SCOPE_LABELS[scope] ?? scope)))

    return () => {
      const state = consent.state.value
      const slot = slots[state]
      if (slot) return slot(slotContext())
      const busy = state === 'loading' || consent.isPending.value
      const wrap = (children: ReturnType<typeof h>[]) =>
        h('div', { 'data-consent': state, 'aria-busy': busy ? 'true' : undefined }, children)
      const status = { 'data-consent': 'message', 'role': 'status', 'aria-live': 'polite' }
      const alert = { 'data-consent': 'message', 'role': 'alert' }
      switch (state) {
        case 'loading':
          return wrap([h('p', status, 'Loading the request…')])
        case 'missing':
          return wrap([h('p', alert, 'This request has expired or was already answered. Start again from the agent.')])
        case 'answered':
          return wrap([h('p', status, 'Returning you to the agent…')])
        case 'ready': {
          const request = consent.request.value!
          return wrap([
            h('p', { 'data-consent': 'client' }, [
              h('strong', request.clientName ?? 'An agent'),
              ' wants to act as you on this site. ',
              h('span', { 'data-consent': 'unverified' }, 'Unverified'),
            ]),
            h('p', { 'data-consent': 'note' }, 'The agent chose this name itself. Approve only an agent you started yourself.'),
            h('p', { 'data-consent': 'redirect' }, [
              'Approving sends you back to ',
              h('code', request.redirectHost),
              '.',
            ]),
            h('p', { 'data-consent': 'scopes-title' }, 'It will be able to:'),
            scopeList(request),
            consent.error.value ? h('p', alert, consent.error.value) : null,
            h('div', { 'data-consent': 'actions' }, [
              h('button', {
                'data-consent': 'deny',
                'type': 'button',
                'disabled': consent.isPending.value,
                'onClick': () => run(false),
              }, 'Deny'),
              h('button', {
                'data-consent': 'approve',
                'type': 'button',
                'disabled': consent.isPending.value,
                'onClick': () => run(true),
              }, 'Approve'),
            ]),
          ].filter((child): child is ReturnType<typeof h> => child !== null))
        }
      }
    }
  },
})
