<script setup lang="ts">
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useModerationTools } from './legal'

/**
 * How content is moderated, as the EU Digital Services Act asks a host's
 * terms to say (Art. 14): a person on your team decides every report, every
 * notice and every appeal, through the admin console's Reports tab; and the
 * automated tools that check content (`appConfig.backend.legal.moderation`),
 * each with what it checks and whether its verdict takes effect on its own
 * or waits for a person. The terms page shows it; a Content page of your
 * own does too, globally registered for Markdown.
 *
 * @example
 * ```md
 * ## How we moderate content
 *
 * ::legal-moderation
 * ::
 * ```
 */
defineOptions({ name: 'LegalModeration' })

const props = defineProps<{
  /** Copy for this statement, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const moderation = useModerationTools(() => props.labels)
const { t } = moderation
</script>

<template>
  <div
    data-backend
    data-legal="moderation"
  >
    <p data-legal="moderation-review">
      {{ t('moderation.review') }}
    </p>
    <template v-if="moderation.tools.value.length > 0">
      <p data-legal="moderation-tools">
        {{ t('moderation.tools') }}
      </p>
      <div data-legal="table-scroll">
        <table data-legal="moderation-table">
          <thead data-legal="head">
            <tr data-legal="columns">
              <th
                scope="col"
                data-legal="column"
              >
                {{ t('moderation.tool') }}
              </th>
              <th
                scope="col"
                data-legal="column"
              >
                {{ t('moderation.checks') }}
              </th>
              <th
                scope="col"
                data-legal="column"
              >
                {{ t('moderation.decides') }}
              </th>
            </tr>
          </thead>
          <tbody data-legal="rows">
            <tr
              v-for="tool in moderation.tools.value"
              :key="tool.key"
              data-legal="tool"
              :data-decides="tool.decides ? 'alone' : 'person'"
            >
              <th
                scope="row"
                data-legal="name"
              >
                {{ tool.name }}
              </th>
              <td data-legal="checks">
                {{ tool.checks }}
              </td>
              <td data-legal="decides">
                {{ tool.decides ? t('moderation.decidesAlone') : t('moderation.flagsOnly') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
