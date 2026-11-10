<script setup lang="ts">
import { computed, useId } from 'vue'
import { busyAttributes } from '../../a11y'
import { GIFT_MESSAGE_MAX, useGiftForm, type GiftField } from '../../composables/use-gift-form'
import { refusalText, useLabels, type BackendLabels, type LabelKey, type LabelOverrides } from '../../composables/use-labels'

/**
 * The gift form: a credit pack or a plan pass with its length (the lengths
 * the plan is gifted for, at their live prices), the recipient's email, a
 * note and a delivery day, then the purchaser's own checkout
 * (`useGifts().send`). A visitor signs in first and comes back to the form
 * with the choice kept; a purchaser back from paying reads that it is on
 * its way. Its words are the `gift` labels; the logic is `useGiftForm()`.
 *
 * @experimental
 *
 * @example
 * ```vue
 * <GiftForm success-url="/gifts?sent=1" />
 * ```
 */
defineOptions({ name: 'GiftForm' })
const props = withDefaults(defineProps<{
  /** Where the purchaser returns once paid. Default: this page with `?sent=1`. */
  successUrl?: string
  /** Open the checkout in the same tab (default `true`). */
  redirect?: boolean
  /** Copy for this form, over `appConfig.backend.labels.gift` and the translations. */
  labels?: LabelOverrides<BackendLabels['gift']>
}>(), { successUrl: undefined, redirect: true, labels: undefined })
const emit = defineEmits({
  /** The purchaser's checkout opened for the gift. */
  checkout: () => true,
  /** It failed: the words the form shows. */
  error: (_message: string) => true,
})
defineSlots<Record<string, never>>()

const form = useGiftForm({ successUrl: props.successUrl, redirect: props.redirect })
const labels = useLabels('gift', () => props.labels)
const { t } = labels
const uid = useId()
const id = (part: string) => `${uid}-${part}`

const problem = computed(() => (form.error.value ? refusalText(labels, form.error.value, t('sendFailed')) : null))
/** What a field carries when the refusal names it: invalid, described by the alert. */
const invalid = (field: GiftField): { 'aria-invalid'?: 'true', 'aria-describedby'?: string } => (form.invalidField.value === field ? { 'aria-invalid': 'true', 'aria-describedby': id('error') } : {})

async function submit() {
  if (form.isPending.value) return
  if (await form.send()) emit('checkout')
  else if (problem.value) emit('error', problem.value)
}
</script>

<template>
  <div
    data-backend
    data-gift="form-root"
    :aria-busy="form.isLoading.value || form.isPending.value || undefined"
  >
    <p
      data-gift="sent"
      role="status"
      aria-live="polite"
      :data-sent="form.sent.value || undefined"
    >
      {{ form.sent.value ? t('sentBack') : '' }}
    </p>
    <p
      v-if="form.isLoading.value"
      data-gift="loading"
      role="status"
    >
      {{ t('loading') }}
    </p>
    <p
      v-else-if="form.kinds.value.length === 0"
      data-gift="nothing"
      role="status"
    >
      {{ t('nothingToGive') }}
    </p>
    <form
      v-else
      data-gift="form"
      :aria-labelledby="id('title')"
      novalidate
      @submit.prevent="submit"
    >
      <h2
        :id="id('title')"
        data-gift="form-title"
      >
        {{ t('formTitle') }}
      </h2>
      <fieldset
        v-if="form.kinds.value.length > 1"
        data-gift="kinds"
      >
        <legend data-gift="legend">
          {{ t('kind') }}
        </legend>
        <label
          v-for="kind in form.kinds.value"
          :key="kind"
          data-gift="option"
        >
          <input
            v-model="form.kind.value"
            data-gift="radio"
            type="radio"
            :name="id('kind')"
            :value="kind"
          >
          {{ t(`kinds.${kind}` as LabelKey<BackendLabels['gift']>) }}
        </label>
      </fieldset>
      <fieldset
        v-if="form.kind.value === 'pack'"
        data-gift="packs"
      >
        <legend data-gift="legend">
          {{ t('packChoice') }}
        </legend>
        <label
          v-for="pack in form.packs.value"
          :key="pack.key"
          data-gift="option"
        >
          <input
            v-model="form.pack.value"
            data-gift="radio"
            type="radio"
            :name="id('pack')"
            :value="pack.key"
          >
          {{ pack.name }}
        </label>
      </fieldset>
      <template v-else>
        <fieldset data-gift="plans">
          <legend data-gift="legend">
            {{ t('planChoice') }}
          </legend>
          <label
            v-for="plan in form.plans.value"
            :key="plan.key"
            data-gift="option"
          >
            <input
              v-model="form.plan.value"
              data-gift="radio"
              type="radio"
              :name="id('plan')"
              :value="plan.key"
            >
            {{ plan.name }}
          </label>
        </fieldset>
        <fieldset data-gift="lengths">
          <legend data-gift="legend">
            {{ t('lengthChoice') }}
          </legend>
          <label
            v-for="length in form.lengths.value"
            :key="length.months"
            data-gift="option"
          >
            <input
              v-model="form.months.value"
              data-gift="radio"
              type="radio"
              :name="id('months')"
              :value="length.months"
            >
            {{ t('lengthOption', { count: length.months }) }}
          </label>
        </fieldset>
        <p data-gift="pass-hint">
          {{ t('passHint') }}
        </p>
      </template>
      <label data-gift="field">
        {{ t('recipient') }}
        <input
          v-model="form.recipientEmail.value"
          data-gift="input-recipient"
          type="email"
          autocomplete="off"
          required
          v-bind="invalid('recipientEmail')"
        >
      </label>
      <label data-gift="field">
        {{ t('note') }}
        <textarea
          v-model="form.message.value"
          data-gift="input-note"
          rows="3"
          :maxlength="GIFT_MESSAGE_MAX"
          :aria-describedby="form.invalidField.value === 'message' ? `${id('note-hint')} ${id('error')}` : id('note-hint')"
          :aria-invalid="form.invalidField.value === 'message' ? 'true' : undefined"
        />
      </label>
      <p
        :id="id('note-hint')"
        data-gift="hint"
      >
        {{ t('noteHint', { count: form.message.value.length, max: GIFT_MESSAGE_MAX }) }}
      </p>
      <label data-gift="field">
        {{ t('deliverDay') }}
        <input
          v-model="form.deliverOn.value"
          data-gift="input-day"
          type="date"
          :min="form.firstDay.value"
          :max="form.lastDay.value"
          :aria-describedby="form.invalidField.value === 'deliverAt' ? `${id('day-hint')} ${id('error')}` : id('day-hint')"
          :aria-invalid="form.invalidField.value === 'deliverAt' ? 'true' : undefined"
        >
      </label>
      <p
        :id="id('day-hint')"
        data-gift="hint"
      >
        {{ t('deliverHint') }}
      </p>
      <p
        v-if="problem"
        :id="id('error')"
        data-gift="form-error"
        role="alert"
      >
        {{ problem }}
      </p>
      <button
        data-gift="send"
        type="submit"
        :disabled="!form.choice.value"
        v-bind="busyAttributes(form.isPending.value)"
      >
        {{ form.isPending.value ? t('sending') : !form.isSignedIn.value ? t('signInToSend') : t('send', { price: form.choice.value?.price ?? '' }) }}
      </button>
      <p data-gift="pay-hint">
        {{ t('payHint') }}
      </p>
    </form>
  </div>
</template>
