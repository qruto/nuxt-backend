<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { WorkspaceListProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import { useWorkspaceSettingsView } from './workspace-settings'

/** `<WorkspaceSettings>`'s workspaces: the list, each row with its switch button, and the form that creates one. */
defineOptions({ name: 'WorkspaceList' })
defineProps<WorkspaceListProps>()
const view = useWorkspaceSettingsView('WorkspaceList')
const { t } = view.labels
const { newName } = view
// The row is named by the workspace's name and slug (two workspaces may
// share a name), which describe its switch button too.
const named = (id: string) => [view.partId(id, 'name'), view.partId(id, 'slug')].join(' ')
</script>

<template>
  <section data-settings="section-workspaces">
    <h3 data-settings="section-title">
      {{ t('workspaces') }}
    </h3>
    <ul data-settings="workspace-list">
      <template
        v-for="entry in workspace.workspaces.value"
        :key="entry.id"
      >
        <VNodes
          v-if="view.slots.workspace"
          :nodes="view.slots.workspace({ ...view.context.value, entry, active: entry.id === workspace.current.value?.id }) as never"
        />
        <!-- Focus lands on the active row after a switch the person made. -->
        <li
          v-else
          data-settings="workspace"
          :data-workspace-id="entry.id"
          :data-active="entry.id === workspace.current.value?.id || undefined"
          :aria-current="entry.id === workspace.current.value?.id ? 'true' : undefined"
          :aria-labelledby="named(entry.id)"
          :tabindex="entry.id === workspace.current.value?.id ? -1 : undefined"
        >
          <span
            :id="view.partId(entry.id, 'name')"
            data-settings="workspace-name"
          >{{ entry.name }}</span>
          <span
            :id="view.partId(entry.id, 'slug')"
            data-settings="workspace-slug"
          >{{ entry.slug }}</span>
          <span
            v-if="entry.id === workspace.current.value?.id"
            data-settings="active-badge"
          >{{ t('active') }}</span>
          <button
            v-else
            data-settings="switch"
            type="button"
            v-bind="busyAttributes(view.context.value.pending === `switch:${entry.id}`)"
            :aria-describedby="named(entry.id)"
            @click="view.context.value.switchWorkspace(entry.id)"
          >
            {{ view.context.value.pending === `switch:${entry.id}` ? t('switching') : t('switch') }}
          </button>
        </li>
      </template>
    </ul>
    <VNodes
      v-if="view.slots.create"
      :nodes="view.slots.create(view.context.value) as never"
    />
    <form
      v-else
      data-settings="create-form"
      @submit.prevent="view.context.value.createWorkspace(newName)"
    >
      <!-- A real label, not a placeholder: a placeholder disappears on the first keystroke and is not announced as the field's name. -->
      <label data-settings="label-create">
        {{ t('workspaceName') }}
        <input
          v-model="newName"
          data-settings="input-name"
          type="text"
          required
        >
      </label>
      <button
        data-settings="create"
        type="submit"
        v-bind="busyAttributes(view.context.value.pending === 'create')"
      >
        {{ view.context.value.pending === 'create' ? t('creating') : t('create') }}
      </button>
    </form>
  </section>
</template>
