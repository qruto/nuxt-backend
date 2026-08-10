import { defineComponent, h } from 'vue'
import { WorkspaceSettings } from '../components/workspace-settings'

/**
 * The ready-made settings page, registered by the module at `/settings`
 * (module option `pages.settings`) behind the `auth` middleware. Workspaces,
 * plan and credits in one place — the billing entity is the active workspace.
 */
export default defineComponent({
  name: 'BackendSettingsPage',
  setup() {
    return () => h('main', { 'data-settings': 'page' }, [h(WorkspaceSettings)])
  },
})
