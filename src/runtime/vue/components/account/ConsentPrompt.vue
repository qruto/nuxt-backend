<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { AGE_KIND, STORAGE_PURPOSES, type StoragePurpose } from '../../../../convex/consent-rules.js'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'
import { type ConsentAsk, useConsents } from '../../composables/use-consents'
import ConsentPromptDialog from './ConsentPromptDialog.vue'
import ConsentPromptStorage from './ConsentPromptStorage.vue'
import type { ConsentPromptSlots } from './consent-prompt'

/**
 * Asks for the consents a person has not given at their current version,
 * and nothing else: the required kinds `setupAccount({ consents })`
 * declares after a version rises (the page waits behind a dialog until they
 * are accepted), the age of an account that never answered the minimum age,
 * and, while the app uses optional storage, one question per browser with
 * **Allow** and **Decline** of equal weight. Nothing is ticked for the person.
 * It renders nothing when there is nothing to ask, on the server, and while
 * an administrator visits the account. Every ready-made page renders it; in
 * a layout of your own, render it once.
 *
 * Semantic markup with `data-consent` attributes for styling. It is built
 * on `useConsents()`.
 *
 * @example
 * ```vue
 * <ConsentPrompt />
 * ```
 */
defineOptions({ name: 'ConsentPrompt' })

const props = withDefaults(defineProps<{
  /** The consent kinds to ask for, by key. Default: every required kind not accepted at its latest version. */
  kinds?: string[]
  /** Copy for this prompt, over `appConfig.backend.labels.consent` and the translations. */
  labels?: LabelGroupOverrides<'consent'>
}>(), { kinds: undefined, labels: undefined })

const emit = defineEmits({
  /** A kind was accepted. */
  granted: (_kind: string) => true,
  /** An answer could not be saved; the reason is also on screen. */
  error: (_message: string) => true,
})

defineSlots<ConsentPromptSlots>()

const { errorMessage } = useLabels('consent', () => props.labels)
const consents = useConsents()

// Nothing renders on the server: the dialog needs the browser, and the answer
// to "who is signed in" settles there.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const asks = computed<ConsentAsk[]>(() => (mounted.value ? consents.asks(props.kinds) : []))
const needsAge = computed(() => mounted.value && (props.kinds ? props.kinds.includes(AGE_KIND) : true) && consents.missing.value.includes(AGE_KIND))
const blocking = computed(() => asks.value.some(ask => ask.required) || needsAge.value)
const dismissed = ref(false)
const showConsents = computed(() => !dismissed.value && (asks.value.length > 0 || needsAge.value))

// The consent manager's question waits for the required ones.
const purposes = computed(() => Object.keys(consents.storage.value).filter((purpose): purpose is StoragePurpose => (STORAGE_PURPOSES as readonly string[]).includes(purpose)))
const showStorage = computed(() => mounted.value && !showConsents.value && consents.isAsking.value && purposes.value.length > 0)

const ticked = reactive<Record<string, boolean>>({})
const age = ref('')
const saving = ref(false)
const shownError = computed(() => (consents.error.value ? errorMessage(consents.error.value) : null))
const ageInvalid = computed(() => consents.error.value?.code === 'invalid_input' && consents.error.value.data.field === 'age')

const ready = computed(() => asks.value.every(ask => !ask.required || ticked[ask.kind]) && (!needsAge.value || age.value.trim() !== ''))

/** Run an answer's calls: one at a time, the failure shown and handed to the app. */
async function answering(calls: () => Promise<void>) {
  // A second press while the first is on its way starts nothing.
  if (saving.value) return
  saving.value = true
  try {
    await calls()
  }
  catch {
    if (consents.error.value) emit('error', errorMessage(consents.error.value))
  }
  finally {
    saving.value = false
  }
}

const submit = () => ready.value && answering(async () => {
  for (const ask of asks.value) {
    if (!ticked[ask.kind]) continue
    await consents.grant(ask.kind)
    emit('granted', ask.kind)
  }
  if (needsAge.value) {
    await consents.grant(AGE_KIND, { age: Number(age.value.trim()) })
    emit('granted', AGE_KIND)
    age.value = ''
  }
})

const choose = (allow: boolean) => answering(() => consents.allowStorage(Object.fromEntries(purposes.value.map(purpose => [purpose, allow]))))
</script>

<template>
  <ConsentPromptDialog
    v-if="showConsents"
    v-model:age="age"
    :asks="asks"
    :ticked="ticked"
    :needs-age="needsAge"
    :blocking="blocking"
    :ready="ready"
    :saving="saving"
    :error="shownError"
    :age-invalid="ageInvalid"
    :labels="labels"
    @tick="(kind, value) => (ticked[kind] = value)"
    @submit="submit"
    @later="dismissed = true"
  >
    <template
      v-if="$slots.consent"
      #consent="slot"
    >
      <slot
        name="consent"
        v-bind="slot"
      />
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </ConsentPromptDialog>
  <ConsentPromptStorage
    v-else-if="showStorage"
    :purposes="purposes"
    :saving="saving"
    :error="shownError"
    :labels="labels"
    @choose="choose"
  />
</template>
