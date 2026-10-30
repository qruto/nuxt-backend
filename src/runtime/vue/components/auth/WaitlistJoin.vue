<script setup lang="ts">
import { computed } from 'vue'
import { useWaitlistStep } from '../../composables/use-waitlist-step'
import type { WaitlistJoinProps } from '../../parts'
import { useWaitlistFormView } from './waitlist-form'

/** `<WaitlistForm>`'s first step: the address, your questions, the launch-news box (unticked), the friend the visitor came through (with a way to drop it), and the honest words about admission. */
defineOptions({ name: 'WaitlistJoin' })
const props = defineProps<WaitlistJoinProps>()
const view = useWaitlistFormView()

const { t, id, errorText, busy } = useWaitlistStep(props.waitlist, view.labels)
const describedBy = computed(() => (errorText.value ? `${id}-error` : undefined))
const question = (key: string) => view.questionLabels()?.[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
</script>

<template>
  <form
    data-waitlist="join"
    @submit.prevent="waitlist.join()"
  >
    <h2 data-waitlist="title">
      {{ t('title') }}
    </h2>
    <p data-waitlist="intro">
      {{ t('intro') }}
    </p>
    <label data-waitlist="label-email">
      {{ t('email') }}
      <input
        v-bind="waitlist.bind.emailInput"
        data-waitlist="input-email"
        :aria-describedby="describedBy"
      >
    </label>
    <label
      v-for="(choices, key) in waitlist.questions.value"
      :key="key"
      data-waitlist="label-question"
    >
      {{ question(String(key)) }}
      <select
        v-bind="waitlist.bind.answerInput(String(key))"
        data-waitlist="input-question"
      >
        <option
          data-waitlist="option"
          value=""
        />
        <option
          v-for="choice in choices"
          :key="choice"
          data-waitlist="option"
          :value="choice"
        >
          {{ choice }}
        </option>
      </select>
    </label>
    <label data-waitlist="label-news">
      <input
        v-bind="waitlist.bind.launchNewsInput"
        data-waitlist="input-news"
      >
      {{ t('launchNews') }}
    </label>
    <p
      v-if="waitlist.ref.value"
      data-waitlist="referral"
    >
      {{ t('referredBy') }}
      <button
        type="button"
        data-waitlist="drop-referral"
        @click="waitlist.dropReferral"
      >
        {{ t('dropReferral') }}
      </button>
    </p>
    <p
      v-if="errorText"
      :id="`${id}-error`"
      data-waitlist="error"
      role="alert"
    >
      {{ errorText }}
    </p>
    <button
      type="submit"
      data-waitlist="submit"
      :aria-disabled="busy"
    >
      {{ waitlist.isPending.value ? t('joining') : t('join') }}
    </button>
    <p data-waitlist="disclosure">
      {{ t('disclosure') }}
    </p>
  </form>
</template>
