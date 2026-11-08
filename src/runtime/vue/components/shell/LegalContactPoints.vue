<script setup lang="ts">
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useContactPoints } from './legal'

/**
 * The single points of contact the EU Digital Services Act asks every host
 * to name: one for the authorities of the member states, the Commission
 * and the Board (Art. 11), one for the people who use the app (Art. 12,
 * `legal.contact` unless you name another), and the languages you answer
 * in, from `appConfig.backend.legal.contactPoints`. The terms page shows
 * it; a Content page of your own does too, globally registered for
 * Markdown. With no contact set, it renders nothing.
 *
 * @example
 * ```md
 * ## Contact
 *
 * ::legal-contact-points
 * ::
 * ```
 */
defineOptions({ name: 'LegalContactPoints' })

const props = defineProps<{
  /** Copy for this list, over `appConfig.backend.labels.legal` and the translations. */
  labels?: LabelGroupOverrides<'legal'>
}>()

const contacts = useContactPoints(() => props.labels)
const { t } = contacts
</script>

<template>
  <dl
    v-if="contacts.points.value.length > 0"
    data-backend
    data-legal="contact-points"
  >
    <div
      v-for="point in contacts.points.value"
      :key="point.key"
      data-legal="contact-point"
      :data-audience="point.key"
    >
      <dt data-legal="contact-audience">
        {{ point.key === 'users' ? t('contactPoints.users', { app: contacts.app.value }) : t('contactPoints.authorities') }}
      </dt>
      <dd data-legal="contact-address">
        <a
          v-if="point.href"
          data-legal="contact-link"
          :href="point.href"
        >{{ point.contact }}</a>
        <template v-else>
          {{ point.contact }}
        </template>
      </dd>
    </div>
    <div
      v-if="contacts.languages.value.length > 0"
      data-legal="contact-point"
      data-audience="languages"
    >
      <dt data-legal="contact-audience">
        {{ t('contactPoints.languages') }}
      </dt>
      <dd data-legal="contact-languages">
        {{ contacts.languages.value.join(', ') }}
      </dd>
    </div>
  </dl>
</template>
