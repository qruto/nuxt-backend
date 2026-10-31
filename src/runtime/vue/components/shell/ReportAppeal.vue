<script setup lang="ts">
/**
 * The `report` page's appeal, for the author of hidden content: the link in
 * their statement of reasons opens it with the decision's token in the
 * fragment. It shows the decision and its reason, then a box for why it
 * should change; once sent, the appeal's state, then its outcome.
 *
 * Internal: the page's body, built on `useReportAppeal`.
 *
 * @internal
 */
import { useReportAppeal } from './report-form'

const props = defineProps<{
  /** The decision's token, from the address's fragment; `null` for none. */
  token: string | null
}>()

const appeal = useReportAppeal(() => props.token)
const { t, id } = appeal
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
    <template v-else-if="appeal.view.value">
      <p data-report="decision">
        {{ t(`appeal.${appeal.view.value.action}`, { date: appeal.date(appeal.view.value.at), title: appeal.view.value.title ?? t('appeal.untitled') }) }}
      </p>
      <p data-report="reason">
        {{ t('appeal.reason', { reason: appeal.view.value.reason }) }}
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
        :aria-busy="appeal.sending.value || undefined"
        @submit.prevent="appeal.submit()"
      >
        <p data-report="until">
          {{ t('appeal.until', { date: appeal.date(appeal.view.value.until) }) }}
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
          v-if="appeal.errorText.value"
          data-report="error"
          role="alert"
        >
          {{ appeal.errorText.value }}
        </p>
        <button
          type="submit"
          data-report="send"
          :aria-disabled="appeal.sending.value || undefined"
        >
          {{ t(appeal.sending.value ? 'appeal.sending' : 'appeal.send') }}
        </button>
      </form>
      <p
        v-else
        data-report="status"
        role="status"
      >
        {{ t(`appeal.${appeal.state.value}`) }}
      </p>
    </template>
  </section>
</template>
