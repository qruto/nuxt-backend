<script setup lang="ts">
/**
 * The processors of the capabilities the app uses: who, what each handles,
 * where, and its agreement, from src/convex/legal.ts, in the words of the
 * `legal.processors` labels. The privacy and subprocessors pages show it.
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
  <div data-legal="table-scroll">
    <table data-legal="processors">
      <thead>
        <tr>
          <th scope="col">
            {{ legal.t('subprocessors.name') }}
          </th>
          <th scope="col">
            {{ legal.t('subprocessors.processes') }}
          </th>
          <th scope="col">
            {{ legal.t('subprocessors.location') }}
          </th>
          <th scope="col">
            {{ legal.t('subprocessors.agreement') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="processor in legal.processors.value"
          :key="processor.key"
          :data-processor="processor.key"
        >
          <th scope="row">
            {{ processor.name }}
          </th>
          <td>{{ legal.t(`processors.${processor.key}.processes`) }}</td>
          <td>{{ processor.location ?? legal.t(`processors.${processor.key}.location`) }}</td>
          <td>
            <a
              v-if="processor.agreement"
              :href="processor.agreement"
              rel="noopener"
              target="_blank"
            >{{ legal.t('subprocessors.agreementLink') }}</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
