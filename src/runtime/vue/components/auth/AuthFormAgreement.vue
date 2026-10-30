<script setup lang="ts">
import { computed, h, type VNodeChild } from 'vue'
import { useConsents } from '../../composables/use-consents'
import type { LoginStep } from '../../composables/use-login-flow'
import type { AuthFormAgreementProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s agreement line, under the steps that can create an
 * account: "By continuing, you agree to the Terms and the Privacy policy",
 * every required consent `setupAccount({ consents })` declares, each a link
 * to its document. Nothing when the app requires none.
 */
defineOptions({ name: 'AuthFormAgreement' })
const props = defineProps<AuthFormAgreementProps>()
const view = useAuthFormView('AuthFormAgreement')
const { t, rich, locale } = view.labels
const { terms } = useConsents()

const AGREEMENT_STEPS: readonly LoginStep[] = ['choose', 'request-code', 'verify-code', 'age']

const sentence = computed((): VNodeChild[] | null => {
  if (terms.value.length === 0 || !AGREEMENT_STEPS.includes(props.flow.step.value)) return null
  const links = terms.value.map(term => (term.url
    ? h('a', { 'data-auth': 'agreement-link', 'href': term.url, 'target': '_blank', 'rel': 'noopener' }, t('agreementItem', { title: term.title }))
    : t('agreementItem', { title: term.title })))
  // The list reads the way the language joins it ("the Terms and the Privacy policy").
  const parts: VNodeChild[] = []
  const formatted = new Intl.ListFormat(locale.value ?? 'en', { style: 'long', type: 'conjunction' }).formatToParts(links.map((_, index) => String(index)))
  for (const part of formatted) parts.push(part.type === 'element' ? links[Number(part.value)]! : part.value)
  return rich('agreement', { terms: parts })
})
</script>

<template>
  <p
    v-if="sentence"
    data-auth="agreement"
  >
    <VNodes :nodes="sentence" />
  </p>
</template>
