<script setup lang="ts">
/**
 * One table of the Access tab: a header row, then one row per code, link
 * or invitation, headed by its first cell, its state as `data-state`, and
 * Revoke while it still admits someone.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import AdminAccessRevoke from './AdminAccessRevoke.vue'
import type { AccessTab } from './admin-access-tab'

/** One row: its id, its `data-state`, its cells (the first heads it), and whether Revoke shows, naming `label`. */
interface AccessTableRow {
  id: string
  state: string
  cells: string[]
  revocable: boolean
  label: string
}

defineProps<{ tab: AccessTab, hook: string, headers: string[], rows: AccessTableRow[] }>()
</script>

<template>
  <table :data-admin="hook">
    <thead>
      <tr>
        <th
          v-for="header in headers"
          :key="header"
          scope="col"
        >
          {{ header }}
        </th>
        <td />
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.id"
        :data-state="row.state"
      >
        <th scope="row">
          {{ row.cells[0] }}
        </th>
        <td
          v-for="(cell, index) in row.cells.slice(1)"
          :key="index"
        >
          {{ cell }}
        </td>
        <td>
          <AdminAccessRevoke
            v-if="row.revocable"
            :tab="tab"
            :target="{ id: row.id, label: row.label }"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>
