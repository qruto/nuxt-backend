import { defineComponent, h } from 'vue'
import { useHead } from '#imports'
import { AgentConsent } from '../components/agent-consent'

/**
 * The ready-made consent page, registered by the module at `/oauth/consent`
 * (module option `pages.agentConsent`) behind the `auth` route middleware.
 * The OAuth provider sends every agent authorization here, so the person
 * approves or denies each one. Apps wanting their own screen set
 * `pages.agentConsent` to a path of their own page and build it with
 * `useAgentConsent()`, or shadow this path with an app page.
 */
export default defineComponent({
  name: 'AgentConsentPage',
  setup() {
    useHead({ title: 'Authorize agent' })
    return () => h('main', { 'data-consent': 'page' }, [
      h('h1', { 'data-consent': 'title' }, 'Authorize agent'),
      h(AgentConsent),
    ])
  },
})
