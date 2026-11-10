<script setup lang="ts">
/**
 * The `report` page's appeal, for the author of hidden content: the link in
 * their statement of reasons opens it with the decision's token in the
 * fragment. It shows the decision and its reason, then a box for why it
 * should change; once sent, the appeal's state, then its outcome.
 *
 * Internal: the page's body, built on the public `useReportAppeal`.
 *
 * @internal
 */
import { computed, useId } from 'vue'
import { useReportAppeal } from '../../composables/use-report-appeal'

const props = defineProps<{
  /** The decision's token, from the address's fragment; `null` for none. */
  token: string | null
}>()

const appeal = useReportAppeal(() => props.token)
const { t, errorMessage } = appeal.labels
const id = useId()
const errorText = computed(() => (appeal.error.value ? errorMessage(appeal.error.value) : null))
</script>

<template>
  <section
    data-report="appeal"
    :data-state="appeal.state.value"
    :aria-busy="appeal.state.value === 'checking' || undefined"
  >
    <h2 data-report="title">
      {{ t('appeal.title') }}
    </h2>
    <p
      v-if="appeal.state.value === 'checking'"
      data-report="status"
      role="status"
    >
      {{ t('appeal.checking') }}
    </p>
    <p
      v-else-if="appeal.state.value === 'unknown'"
      data-report="status"
      role="alert"
    >
      {{ t('appeal.unknown') }}
    </p>
    <template v-else-if="appeal.decision.value">
      <p data-report="decision">
        {{ t(`appeal.${appeal.decision.value.action}`, { date: appeal.formatDate(appeal.decision.value.at), title: appeal.decision.value.title ?? t('appeal.untitled') }) }}
      </p>
      <p data-report="reason">
        {{ t('appeal.reason', { reason: appeal.decision.value.reason }) }}
      </p>
      <p
        v-if="appeal.state.value === 'expired'"
        data-report="status"
        role="status"
      >
        {{ t('appeal.expired') }}
      </p>
      <form
        v-else-if="appeal.state.value === 'form'"
        data-report="appeal-form"
        :aria-busy="appeal.isPending.value || undefined"
        @submit.prevent="appeal.send()"
      >
        <p data-report="until">
          {{ t('appeal.until', { date: appeal.formatDate(appeal.decision.value.until) }) }}
        </p>
        <label :for="`${id}-text`">{{ t('appeal.text') }}</label>
        <textarea
          :id="`${id}-text`"
          v-model="appeal.text.value"
          data-report="input-appeal"
          name="text"
          rows="5"
          required
          maxlength="4000"
        />
        <p
          v-if="errorText"
          data-report="error"
          role="alert"
        >
          {{ errorText }}
        </p>
        <button
          type="submit"
          data-report="send"
          :aria-disabled="appeal.isPending.value || undefined"
        >
          {{ t(appeal.isPending.value ? 'appeal.sending' : 'appeal.send') }}
        </button>
      </form>
      <p
        v-else-if="appeal.state.value !== 'none'"
        data-report="status"
        role="status"
      >
        {{ t(`appeal.${appeal.state.value}`) }}
      </p>
    </template>
  </section>
</template>
