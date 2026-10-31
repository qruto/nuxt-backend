<script setup lang="ts">
import { computed } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import type { AccountDeletionProps } from '../../parts'
import { useAccountDataView } from './account-data'

/**
 * `<AccountData>`'s deletion: the warning, the field to type the account's
 * address in, and the button that schedules the deletion once it matches.
 * While a deletion waits out its grace period: its date, and a button that
 * keeps the account.
 */
defineOptions({ name: 'AccountDeletion' })
const props = defineProps<AccountDeletionProps>()
const view = useAccountDataView('AccountDeletion')
const { t, locale } = view.labels
const { typed } = view
const titleId = `${view.id}-delete`
const hintId = `${view.id}-hint`
const invalid = computed(() => view.mismatched.value && !view.context.value.confirmed)
const deleting = computed(() => view.context.value.pendingAction === 'delete')
const waiting = computed(() => view.context.value.deletion)

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  void view.context.value.deleteAccount()
}
</script>

<template>
  <!-- A deletion is waiting: its date, and the way to keep the account. -->
  <section
    v-if="waiting"
    data-account="section-delete"
    data-state="scheduled"
    :aria-labelledby="titleId"
  >
    <h3
      :id="titleId"
      data-account="section-title"
    >
      {{ t('deleteTitle') }}
    </h3>
    <p data-account="warning">
      {{ t('scheduledNote', { date: formatBillingDate(waiting.deletesAt, { dateStyle: 'long' }, locale) }) }}
    </p>
    <button
      data-account="keep"
      type="button"
      :aria-disabled="deleting ? 'true' : undefined"
      @click="view.context.value.keepAccount()"
    >
      {{ deleting ? t('keeping') : t('keep') }}
    </button>
  </section>
  <section
    v-else
    data-account="section-delete"
    :aria-labelledby="titleId"
  >
    <h3
      :id="titleId"
      data-account="section-title"
    >
      {{ t('deleteTitle') }}
    </h3>
    <p data-account="warning">
      {{ t('deleteNote') }}
    </p>
    <label data-account="confirm-label">
      <span data-account="confirm-text">{{ t('confirmLabel', { email: props.account.confirmation.value }) }}</span>
      <input
        v-model="typed"
        data-account="confirm-input"
        type="email"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="invalid ? 'true' : undefined"
        :data-invalid="invalid ? '' : undefined"
        :aria-describedby="hintId"
        @keydown="keydown"
      >
    </label>
    <p
      :id="hintId"
      data-account="confirm-hint"
    >
      {{ invalid ? t('confirmMismatch') : t('confirmHint') }}
    </p>
    <!-- Unavailable until the address matches; busy while the deletion runs. -->
    <button
      data-account="delete"
      type="button"
      :aria-disabled="!view.context.value.confirmed || deleting ? 'true' : undefined"
      :data-state="deleting ? 'pending' : 'idle'"
      @click="view.context.value.deleteAccount()"
    >
      {{ deleting ? t('deleting') : t('delete') }}
    </button>
  </section>
</template>
