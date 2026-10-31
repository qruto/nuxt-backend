<script setup lang="ts">
/**
 * The privacy page's data map: for each capability the app uses, what it
 * keeps and for how long, from the account-data registry, in the words of
 * the `legal.data` labels.
 *
 * Internal: a section of `LegalDocument`, built on `useLegalDocument`.
 *
 * @internal
 */
import type { LegalDocument } from './legal'

defineProps<{
  /** The page's state, from `useLegalDocument`. */
  legal: LegalDocument
}>()
</script>

<template>
  <div data-legal="data-map">
    <section
      v-for="group in legal.groups.value"
      :key="group.capability"
      data-legal="data-group"
      :data-capability="group.capability"
    >
      <h3 data-legal="subtitle">
        {{ legal.t(`capabilities.${group.capability}`) }}
      </h3>
      <dl data-legal="data-rows">
        <div
          v-for="participant in group.participants"
          :key="participant"
          data-legal="data-row"
          :data-participant="participant"
        >
          <dt>{{ legal.t(`data.${participant}.holds`) }}</dt>
          <dd>
            <span data-legal="label">{{ legal.t('privacy.kept') }}:</span>
            {{ legal.t(`data.${participant}.kept`) }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
