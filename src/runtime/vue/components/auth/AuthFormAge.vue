<script setup lang="ts">
import type { AuthFormAgeProps } from '../../parts'
import { fieldState, useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s age step, for a new address when the app sets a minimum
 * age: asked once, with an empty field, and it never names the minimum.
 */
defineOptions({ name: 'AuthFormAge' })
defineProps<AuthFormAgeProps>()
const view = useAuthFormView('AuthFormAge')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-age"
    @submit.prevent="flow.submitAge()"
  >
    <label data-auth="label-age">
      {{ t('ageQuestion') }}
      <input
        v-model="flow.age.value"
        data-auth="input-age"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        pattern="[0-9]*"
        required
        v-bind="fieldState(flow, view, 'age')"
      >
    </label>
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
    >
      {{ flow.isPending.value ? t('ageChecking') : t('ageSubmit') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
