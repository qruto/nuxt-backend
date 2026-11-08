<script setup lang="ts">
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLegalTable } from './legal'

/**
 * Every cookie and storage key the package writes for the capabilities the
 * app uses, then the app's own (`appConfig.backend.legal.storage`), as a
 * table: its name, where it lives, what it is for, how long it lasts, and
 * whether it waits for the person's permission. The privacy page shows it;
 * a Content page of your own does too, globally registered for Markdown,
 * so your cookie policy lists what the app writes.
 *
 * @example
 * ```md
 * ## The list
 *
 * ::legal-storage
 * ::
 * ```
 */
defineOptions({ name: 'LegalStorage' })

const props = defineProps<{
  /** Copy for this table, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const legal = useLegalTable(() => props.labels)
</script>

<template>
  <div
    data-backend
    data-legal="table-scroll"
  >
    <table data-legal="storage">
      <thead data-legal="head">
        <tr data-legal="columns">
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('storageName') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('storageKind') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('storageWhy') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('storageLasts') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('storageConsent') }}
          </th>
        </tr>
      </thead>
      <tbody data-legal="rows">
        <tr
          v-for="item in legal.storage.value"
          :key="item.key"
          data-legal="stored"
          :data-storage="item.key"
          :data-consent="item.consent"
        >
          <th
            scope="row"
            data-legal="name"
          >
            <code>{{ item.name }}</code>
          </th>
          <td data-legal="kind">
            {{ legal.t(`kinds.${item.kind}`) }}
          </td>
          <td data-legal="why">
            {{ item.why }}
          </td>
          <td data-legal="lasts">
            {{ item.lasts }}
          </td>
          <td data-legal="consent">
            {{ legal.t(`consents.${item.consent}`) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
