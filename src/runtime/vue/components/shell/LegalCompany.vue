<script setup lang="ts">
import { computed } from 'vue'
import type { LegalDocument } from './legal'

/**
 * The company's details as a legal page prints them, one line each: its
 * postal address, registration number, VAT line, contact and data
 * protection officer, the ones the page asks for that app config sets.
 *
 * Internal: a section of `LegalDocument`, built on `useLegalDocument`.
 *
 * @internal
 */
const props = defineProps<{
  /** The page's state, from `useLegalDocument`. */
  legal: LegalDocument
  /** The details to print, in order. */
  fields: ReadonlyArray<'address' | 'registration' | 'vat' | 'contact' | 'dpo'>
}>()

const lines = computed(() => props.fields.flatMap((field) => {
  const value = props.legal.details.value[field]
  return value ? [{ field, text: props.legal.t(`controller.${field}`, { [field]: value }) }] : []
}))
</script>

<template>
  <address
    v-if="lines.length > 0"
    data-legal="controller"
  >
    <span
      v-for="line in lines"
      :key="line.field"
    >{{ line.text }}</span>
  </address>
</template>
