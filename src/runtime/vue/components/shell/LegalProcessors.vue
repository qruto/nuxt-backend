<script setup lang="ts">
import { useId } from 'vue'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLegalTable } from './legal'

/**
 * The processors an app on the package hands personal data to, as a
 * table: who, what each handles, where, and its agreement. The ones of the
 * capabilities the app uses come from src/convex/legal.ts, each where
 * `appConfig.backend.legal.locations` says, then the app's own
 * (`appConfig.backend.legal.processors`). The privacy and subprocessors
 * pages show it; a Content page of your own does too, globally registered
 * for Markdown, so your policy lists what the app runs.
 *
 * @example
 * ```md
 * ## Who helps us
 *
 * ::legal-processors
 * ::
 * ```
 */
defineOptions({ name: 'LegalProcessors' })

const props = defineProps<{
  /** Copy for this table, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const legal = useLegalTable(() => props.labels)
// Each agreement link is described by its row's processor, so a list of links reads apart.
const id = useId()
</script>

<template>
  <div
    data-backend
    data-legal="table-scroll"
  >
    <table data-legal="processors">
      <thead data-legal="head">
        <tr data-legal="columns">
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('subprocessors.name') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('subprocessors.processes') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('subprocessors.location') }}
          </th>
          <th
            scope="col"
            data-legal="column"
          >
            {{ legal.t('subprocessors.agreement') }}
          </th>
        </tr>
      </thead>
      <tbody data-legal="rows">
        <tr
          v-for="(processor, index) in legal.processors.value"
          :key="processor.key"
          data-legal="processor"
          :data-processor="processor.key"
        >
          <th
            :id="`${id}-${index}`"
            scope="row"
            data-legal="name"
          >
            {{ processor.name }}
          </th>
          <td data-legal="processes">
            {{ processor.processes }}
          </td>
          <td data-legal="location">
            {{ processor.location }}
          </td>
          <td data-legal="agreement">
            <a
              v-if="processor.agreement"
              data-legal="agreement-link"
              :href="processor.agreement"
              :aria-describedby="`${id}-${index}`"
              rel="noopener"
              target="_blank"
            >{{ legal.t('subprocessors.agreementLink') }}</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
