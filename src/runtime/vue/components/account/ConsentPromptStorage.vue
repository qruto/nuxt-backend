<script setup lang="ts">
/**
 * The consent manager's question of `<ConsentPrompt>`: which optional
 * storage this browser allows. Not a wall, a region the page stays readable
 * around; **Allow** and **Decline** are the same kind of button, so neither
 * is the easier one to press, and each purpose is off until allowed.
 *
 * Internal: a part of `<ConsentPrompt>`.
 *
 * @internal
 */
import { useId } from 'vue'
import type { StoragePurpose } from '../../../../convex/consent-rules.js'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'

const props = defineProps<{
  purposes: StoragePurpose[]
  saving: boolean
  error: string | null
  labels?: LabelGroupOverrides<'consent'>
}>()

defineEmits<{ choose: [allow: boolean] }>()

const { t } = useLabels('consent', () => props.labels)
const id = useId()
</script>

<template>
  <section
    data-consent="storage"
    :data-state="saving ? 'pending' : 'ready'"
    :aria-labelledby="`${id}-storage`"
    :aria-busy="saving || undefined"
  >
    <h2
      :id="`${id}-storage`"
      data-consent="title"
    >
      {{ t('storageTitle') }}
    </h2>
    <p data-consent="note">
      {{ t('storageIntro') }}
    </p>
    <ul data-consent="purposes">
      <li
        v-for="purpose in purposes"
        :key="purpose"
        data-consent="purpose"
        :data-purpose="purpose"
      >
        {{ t(`purposes.${purpose}`) }}
      </li>
    </ul>
    <p
      v-if="error"
      data-consent="error"
      role="alert"
    >
      {{ error }}
    </p>
    <div data-consent="actions">
      <button
        type="button"
        data-consent="allow"
        :aria-disabled="saving ? 'true' : undefined"
        @click="$emit('choose', true)"
      >
        {{ t('allow') }}
      </button>
      <button
        type="button"
        data-consent="decline"
        :aria-disabled="saving ? 'true' : undefined"
        @click="$emit('choose', false)"
      >
        {{ t('decline') }}
      </button>
    </div>
  </section>
</template>
