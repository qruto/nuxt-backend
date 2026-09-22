import { defineComponent, h } from 'vue'
import { useHead } from '#imports'
import { SecuritySettings } from '../components/security-settings'
import { useBackendConfig } from '../composables/use-backend-config'

/**
 * The ready-made security page, registered by the module at `/security`
 * (module option `pages.security`) behind the `auth` middleware: email
 * verification, passkeys, sessions, and account deletion.
 */
export default defineComponent({
  name: 'BackendSecurityPage',
  setup() {
    const title = useBackendConfig().labels.security?.title ?? 'Security'
    useHead({ title })
    return () => h('main', { 'data-security': 'page' }, [
      h('h1', { 'data-security': 'title' }, title),
      h(SecuritySettings),
    ])
  },
})
