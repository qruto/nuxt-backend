import { defineComponent, h } from 'vue'
import { useHead } from '#imports'
import { ProfileSettings } from '../components/profile-settings'
import { useBackendConfig } from '../composables/use-backend-config'

/**
 * The ready-made profile page, registered by the module at `/profile`
 * (module option `pages.profile`) behind the `auth` middleware.
 */
export default defineComponent({
  name: 'BackendProfilePage',
  setup() {
    const title = useBackendConfig().labels.profile?.title ?? 'Profile'
    useHead({ title })
    return () => h('main', { 'data-profile': 'page' }, [
      h('h1', { 'data-profile': 'title' }, title),
      h(ProfileSettings),
    ])
  },
})
