<script setup lang="ts">
import { computed } from 'vue'
import type { LegalDocument } from './legal'

/**
 * The company's details as a legal page prints them, one line each: its
 * postal address, phone, registration number, share capital, VAT line,
 * publication director, contact, data protection officer and host, the
 * ones the page asks for that app config sets.
 *
 * Internal: a section of `LegalDocument`, built on `useLegalDocument`.
 *
 * @internal
 */
const props = defineProps<{
  /** The page's state, from `useLegalDocument`. */
  legal: LegalDocument
  /** The details to print, in order. */
  fields: ReadonlyArray<'address' | 'phone' | 'registration' | 'capital' | 'vat' | 'director' | 'contact' | 'dpo' | 'host'>
}>()

const lines = computed(() => props.fields.flatMap((field) => {
  const value = field === 'host' ? props.legal.hostLine.value : props.legal.details.value[field]
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
