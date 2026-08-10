import { defineComponent, h } from 'vue'
import { ProfileSettings } from '../components/profile-settings'

/**
 * The ready-made profile page, registered by the module at `/profile`
 * (module option `pages.profile`) behind the `auth` middleware.
 */
export default defineComponent({
  name: 'BackendProfilePage',
  setup() {
    return () => h('main', { 'data-profile': 'page' }, [h(ProfileSettings)])
  },
})
