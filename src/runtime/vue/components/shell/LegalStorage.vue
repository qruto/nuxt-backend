<script setup lang="ts">
/**
 * Every cookie and storage key the package writes for the capabilities the
 * app uses: its name, what it is for, how long it lasts, and whether it
 * waits for the person's permission, from src/convex/legal.ts, in the words
 * of the `legal.storage` labels.
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
    <table data-legal="storage">
      <thead>
        <tr>
          <th scope="col">
            {{ legal.t('storageName') }}
          </th>
          <th scope="col">
            {{ legal.t('storageKind') }}
          </th>
          <th scope="col">
            {{ legal.t('storageWhy') }}
          </th>
          <th scope="col">
            {{ legal.t('storageLasts') }}
          </th>
          <th scope="col">
            {{ legal.t('storageConsent') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in legal.storage.value"
          :key="item.key"
          :data-storage="item.key"
          :data-consent="item.consent"
        >
          <th scope="row">
            <code>{{ item.name }}</code>
          </th>
          <td>{{ legal.t(`kinds.${item.kind}`) }}</td>
          <td>{{ legal.t(`storage.${item.key}.why`) }}</td>
          <td>{{ legal.t(`storage.${item.key}.lasts`) }}</td>
          <td>{{ legal.t(`consents.${item.consent}`) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
