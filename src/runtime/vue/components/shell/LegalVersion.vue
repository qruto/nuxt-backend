<script setup lang="ts">
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLegalVersion } from './legal'

/**
 * The version of one of your documents, as `setupAccount({ consents })`
 * declares it in `backend/account.ts`: the version the consent ledger
 * records when someone agrees, so the page and the record never disagree.
 * Raise it there, and every page that prints it follows, a Content page
 * included: it is globally registered for Markdown. Until the deployment
 * answers, and for a kind it does not declare, it renders nothing; in
 * development it marks a kind it does not declare.
 *
 * @example
 * ```md
 * Version :legal-version{kind="privacy"}
 * ```
 */
defineOptions({ name: 'LegalVersion' })

const props = defineProps<{
  /** The consent kind whose version to print: `privacy`, `terms`, or a kind of yours. */
  kind: string
  /** Copy for the development mark, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const version = useLegalVersion(() => props.kind, () => props.labels)
</script>

<template>
  <span
    v-if="version.text"
    data-backend
    data-legal="version"
    :data-kind="kind"
  >{{ version.text }}</span>
  <mark
    v-else-if="version.unsetNote"
    data-backend
    data-legal="version-unset"
    :data-kind="kind"
  >{{ version.unsetNote }}</mark>
</template>
