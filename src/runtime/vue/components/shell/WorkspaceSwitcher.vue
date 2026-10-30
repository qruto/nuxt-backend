<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePopoverDisclosure } from '../../composables/use-app-shell'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import type { WorkspaceSwitcherProps } from '../../parts'

/**
 * `<AppShell>`'s workspace switcher: a button naming the active workspace
 * and the disclosure it opens, on the browser's native popover: every
 * workspace with the person's role in it, the invitations waiting, a form to
 * create one in place, and a link to manage them. Switching sets the active
 * workspace for the session, and a switch that fails leaves the old one
 * active and says so.
 */
defineOptions({ name: 'WorkspaceSwitcher' })
const props = defineProps<WorkspaceSwitcherProps>()
const switcher = props.shell.switcher!
const { t } = switcher.labels
const settings = useBackendPagePath('settings')

const panel = ref<HTMLElement | null>(null)
const menu = usePopoverDisclosure(() => void switcher.load())
const waiting = computed(() => switcher.invitations.value ?? 0)
// The switch is done once the old workspace is no longer active: close the menu, and focus returns to its button.
const close = () => panel.value?.hidePopover?.()
const pick = async (id: string, isCurrent: boolean) => {
  if (isCurrent) return close()
  if (await switcher.switchTo(id)) close()
}
const create = async () => {
  if (await switcher.create(switcher.newName.value)) close()
}
</script>

<template>
  <div
    data-shell="switcher"
    :data-state="switcher.pending.value ? 'pending' : menu.open.value ? 'open' : 'closed'"
  >
    <button
      v-bind="menu.trigger.value"
      data-shell="switcher-button"
      :aria-label="t('workspaces.menu', { name: switcher.currentName.value })"
    >
      <span data-shell="switcher-name">{{ switcher.currentName.value }}</span>
    </button>
    <div
      ref="panel"
      v-bind="menu.panel({ 'data-shell': 'switcher-panel' })"
    >
      <p data-shell="switcher-heading">
        {{ t('workspaces.heading') }}
      </p>
      <ul data-shell="workspace-list">
        <li
          v-for="entry in switcher.workspaces.value"
          :key="entry.id"
          data-shell="workspace-item"
          :data-workspace-id="entry.id"
        >
          <button
            type="button"
            data-shell="workspace"
            :aria-current="entry.isCurrent ? 'true' : undefined"
            :aria-disabled="switcher.pending.value ? 'true' : undefined"
            @click="pick(entry.id, entry.isCurrent)"
          >
            <!-- The parts of the name are separate words to a screen reader, as they are on the screen. -->
            <span data-shell="workspace-name">{{ entry.name }}</span>{{ ' ' }}
            <span data-shell="workspace-slug">{{ entry.slug }}</span>{{ ' ' }}
            <template v-if="entry.roleLabel">
              <span data-shell="workspace-role">{{ entry.roleLabel }}</span>{{ ' ' }}
            </template>
            <span
              v-if="entry.isCurrent"
              data-shell="workspace-current"
            >{{ t('workspaces.current') }}</span>
            <span
              v-else-if="switcher.pending.value === `switch:${entry.id}`"
              data-shell="workspace-pending"
            >{{ t('workspaces.switching') }}</span>
          </button>
        </li>
      </ul>
      <p
        v-if="waiting > 0"
        data-shell="invitations"
      >
        {{ t('workspaces.invitations', { count: waiting }) }}
      </p>
      <form
        data-shell="create"
        @submit.prevent="create"
      >
        <label data-shell="create-label">
          {{ t('workspaces.newName') }}
          <input
            v-model="switcher.newName.value"
            data-shell="create-input"
            type="text"
            maxlength="100"
            autocomplete="off"
          >
        </label>
        <button
          type="submit"
          data-shell="create-submit"
          :aria-disabled="switcher.pending.value ? 'true' : undefined"
        >
          {{ switcher.pending.value === 'create' ? t('workspaces.creating') : t('workspaces.create') }}
        </button>
      </form>
      <NuxtLink
        v-if="settings"
        :to="settings"
        data-shell="manage"
      >
        {{ t('workspaces.manage') }}
      </NuxtLink>
    </div>
    <p
      role="status"
      aria-live="polite"
      data-shell="status"
    >
      {{ switcher.message.value?.kind === 'status' ? switcher.message.value.text : '' }}
    </p>
    <p
      v-if="switcher.message.value?.kind === 'error'"
      role="alert"
      data-shell="error"
    >
      {{ switcher.message.value.text }}
    </p>
  </div>
</template>
