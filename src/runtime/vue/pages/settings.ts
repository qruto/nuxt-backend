import { defineComponent, h } from 'vue'
import { useHead } from '#imports'
import { WorkspaceSettings } from '../components/workspace-settings'
import { useBackendConfig } from '../composables/use-backend-config'

/**
 * The ready-made settings page, registered by the module at `/settings`
 * (module option `pages.settings`) behind the `auth` middleware. Workspaces,
 * plan and credits in one place — the billing entity is the active workspace.
 */
export default defineComponent({
  name: 'BackendSettingsPage',
  setup() {
    const title = useBackendConfig().labels.settings?.title ?? 'Settings'
    useHead({ title })
    return () => h('main', { 'data-settings': 'page' }, [
      h('h1', { 'data-settings': 'title' }, title),
      h(WorkspaceSettings),
    ])
  },
})
