<script setup lang="ts">
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { type LegalDetailField, useLegalDetail } from './legal'

/**
 * One of the company details `appConfig.backend.legal` holds, inside a
 * sentence of yours: the company, its address and phone, the contact, the
 * data protection officer, the registration number, the share capital, the
 * VAT line, the publication director, the host or the consumer mediator.
 * The contact and the officer are links when they are an address or a URL,
 * the phone a `tel:` link, and the mediator links its site. Write a detail
 * once in app config, and every page that names it says the same, a
 * Content page included: it is globally registered for Markdown. Unset, it
 * renders nothing; in development it marks the gap, so an unfinished page
 * never passes for a finished one.
 *
 * @example
 * ```md
 * The controller of your data is :legal-detail{field="company"},
 * :legal-detail{field="address"}. Registration: :legal-detail{field="registration"}.
 * ```
 */
defineOptions({ name: 'LegalDetail' })

const props = defineProps<{
  /** Which detail: `company`, `address`, `contact`, `dpo`, `phone`, `registration`, `capital`, `vat`, `director`, `host` or `mediator`. */
  field: LegalDetailField
  /** Copy for the development mark, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const detail = useLegalDetail(() => props.field, () => props.labels)
</script>

<template>
  <span
    v-if="detail.text"
    data-backend
    data-legal="detail"
    :data-field="field"
  ><a
    v-if="detail.href"
    data-legal="detail-link"
    :href="detail.href"
    :rel="detail.external ? 'noopener' : undefined"
    :target="detail.external ? '_blank' : undefined"
  >{{ detail.text }}</a><template v-else>{{ detail.text }}</template></span>
  <mark
    v-else-if="detail.unsetNote"
    data-backend
    data-legal="detail-unset"
    :data-field="field"
  >{{ detail.unsetNote }}</mark>
</template>
