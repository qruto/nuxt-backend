import { defineComponent, h } from 'vue'
import { SecuritySettings } from '../components/security-settings'

/**
 * The ready-made security page, registered by the module at `/security`
 * (module option `pages.security`) behind the `auth` middleware: email
 * verification, passkeys, sessions, and account deletion.
 */
export default defineComponent({
  name: 'BackendSecurityPage',
  setup() {
    return () => h('main', { 'data-security': 'page' }, [h(SecuritySettings)])
  },
})
