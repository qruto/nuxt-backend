<script setup lang="ts">
/**
 * The `report` page's notice form, for anyone, signed in or not: the link to
 * the content, the reason (an intimate image shared without consent among
 * them), why, the notifier's name and address, a typed signature for an
 * intimate-image request, and the good-faith statement DSA Art. 16 asks
 * for. Once sent, it says the report arrived; a receipt follows by email.
 *
 * Internal: the page's body, built on `useReportNotice`.
 *
 * @internal
 */
import { useReportNotice } from './report-form'

const notice = useReportNotice()
const { t, id, form } = notice
const invalid = (field: string) => (notice.invalidField.value === field ? true : undefined)
</script>

<template>
  <p
    v-if="notice.state.value === 'sent'"
    data-report="sent"
    role="status"
  >
    {{ t(notice.anonymous.value ? 'sentAnonymous' : 'sent') }}
  </p>
  <form
    v-else
    data-report="notice"
    :aria-busy="notice.state.value === 'sending' || undefined"
    @submit.prevent="notice.submit()"
  >
    <p data-report="intro">
      {{ t('intro') }}
    </p>
    <label :for="`${id}-url`">{{ t('url') }}</label>
    <input
      :id="`${id}-url`"
      v-model="form.url"
      data-report="input-url"
      type="url"
      name="url"
      required
      maxlength="2048"
      :aria-invalid="invalid('url')"
      :aria-describedby="`${id}-url-hint`"
    >
    <p
      :id="`${id}-url-hint`"
      data-report="hint"
    >
      {{ t('urlHint') }}
    </p>
    <fieldset data-report="reasons">
      <legend>{{ t('reason') }}</legend>
      <label
        v-for="reason in notice.reasons"
        :key="reason"
        data-report="reason"
      >
        <input
          v-model="form.reason"
          type="radio"
          name="reason"
          :value="reason"
        >
        {{ t(`reasons.${reason}`) }}
      </label>
    </fieldset>
    <p
      v-if="notice.intimate.value"
      data-report="intimate-note"
    >
      {{ t('intimateNote') }}
    </p>
    <label :for="`${id}-details`">{{ t('details') }}</label>
    <textarea
      :id="`${id}-details`"
      v-model="form.details"
      data-report="input-details"
      name="details"
      rows="4"
      required
      maxlength="4000"
      :aria-invalid="invalid('details')"
      :aria-describedby="`${id}-details-hint`"
    />
    <p
      :id="`${id}-details-hint`"
      data-report="hint"
    >
      {{ t('detailsHint') }}
    </p>
    <label :for="`${id}-name`">{{ t('name') }}</label>
    <input
      :id="`${id}-name`"
      v-model="form.name"
      data-report="input-name"
      name="name"
      autocomplete="name"
      maxlength="200"
      :required="notice.contactRequired.value"
      :aria-invalid="invalid('name')"
      :aria-describedby="`${id}-contact-hint`"
    >
    <label :for="`${id}-email`">{{ t('email') }}</label>
    <input
      :id="`${id}-email`"
      v-model="form.email"
      data-report="input-email"
      type="email"
      name="email"
      autocomplete="email"
      maxlength="320"
      :required="notice.contactRequired.value"
      :aria-invalid="invalid('email')"
      :aria-describedby="`${id}-contact-hint`"
    >
    <p
      :id="`${id}-contact-hint`"
      data-report="hint"
    >
      {{ t('contactHint') }}
    </p>
    <template v-if="notice.intimate.value">
      <label :for="`${id}-signature`">{{ t('signature') }}</label>
      <input
        :id="`${id}-signature`"
        v-model="form.signature"
        data-report="input-signature"
        name="signature"
        required
        maxlength="200"
        :aria-invalid="invalid('signature')"
        :aria-describedby="`${id}-signature-hint`"
      >
      <p
        :id="`${id}-signature-hint`"
        data-report="hint"
      >
        {{ t('signatureHint') }}
      </p>
    </template>
    <label data-report="good-faith">
      <input
        v-model="form.goodFaith"
        type="checkbox"
        name="goodFaith"
        required
        :aria-invalid="invalid('goodFaith')"
      >
      {{ t('goodFaith') }}
    </label>
    <p
      v-if="notice.errorText.value"
      data-report="error"
      role="alert"
    >
      {{ notice.errorText.value }}
    </p>
    <button
      type="submit"
      data-report="send"
      :aria-disabled="notice.state.value === 'sending' || undefined"
    >
      {{ t(notice.state.value === 'sending' ? 'sending' : 'send') }}
    </button>
  </form>
</template>
