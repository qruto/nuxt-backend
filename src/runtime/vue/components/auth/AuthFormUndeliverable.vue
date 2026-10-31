<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { AuthFormUndeliverableProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s step for an address the email provider stopped delivering
 * to, after a hard bounce or a complaint: no code was sent. Its words are
 * the same whether or not an account holds the address, so the step tells
 * no one who has signed up. It offers to try another address.
 */
defineOptions({ name: 'AuthFormUndeliverable' })
defineProps<AuthFormUndeliverableProps>()
const view = useAuthFormView('AuthFormUndeliverable')
const { t } = view.labels
</script>

<template>
  <section data-auth="step-undeliverable">
    <p
      data-auth="undeliverable-note"
      role="alert"
    >
      {{ t('undeliverable') }}
    </p>
    <button
      data-auth="use-another-email"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="flow.goTo('request-code')"
    >
      {{ t('tryAnotherEmail') }}
    </button>
  </section>
</template>
