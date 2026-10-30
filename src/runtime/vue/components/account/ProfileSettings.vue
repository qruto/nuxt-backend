<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { matchLocale, normalizeLocale } from '../../../../convex/locale.js'
import { useAccount } from '../../composables/use-account'
import { useEmailChange } from '../../composables/use-email-change'
import { useEmailPreferences } from '../../composables/use-email-preferences'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useWorkspace } from '../../composables/use-workspace'
import { useAppLanguages } from '../../utils/active-locale'
import { useAuthSession } from '../../utils/auth-session'
import { defaultValidateEmail } from '../../utils/auth-steps'
import { useSettingsMessage } from '../../utils/settings-message'
import { provideProfileView, type ProfileSettingsSlots, type ProfileSlotContext } from './profile-settings'

/**
 * Account profile: identity chrome (avatar initials, verification / role /
 * workspace badges), display-name editing, the email change, by a code from
 * each address, and, with `@nuxtjs/i18n` and two locales or more, the
 * person's language, which their emails are written in. Identity renders
 * client-only — session state differs between SSR and hydration.
 *
 * Markup on `data-profile` hooks, built from parts (`ProfileIdentity`,
 * `ProfileNameSection`, `ProfileEmailSection`, `ProfileLanguageSection`,
 * `ProfilePreferencesSection`);
 * replace any region via its slot — each slot receives {@link ProfileSlotContext}.
 */
defineOptions({ name: 'ProfileSettings' })

const props = withDefaults(defineProps<{
  /** Gate the new email before any code is sent (`true` | `false` | custom message). Default: a basic shape check. */
  validateEmail?: (email: string) => boolean | string
  showIdentity?: boolean
  /** Copy for this component, over `appConfig.backend.labels.profile` and the translations. */
  labels?: LabelOverrides<BackendLabels['profile']>
}>(), { validateEmail: undefined, showIdentity: true, labels: undefined })

const emit = defineEmits({
  'name-saved': (_name: string) => true,
  'email-changed': (_newEmail: string) => true,
  'error': (_message: string) => true,
})
defineSlots<ProfileSettingsSlots>()

const auth = useAuthSession()
const account = useAccount()
const workspace = useWorkspace()
const preferences = useEmailPreferences()
const labels = useLabels('profile', () => props.labels)
const { t, errorMessage } = labels
const id = useId()
const root = ref<HTMLElement | null>(null)

// Session state differs between SSR (no session) and hydration — identity
// chrome only renders after mount.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const name = ref('')
watch(auth.user, (user) => {
  if (user && !name.value) name.value = (user.name as string | undefined) ?? ''
}, { immediate: true })

const { note, message } = useSettingsMessage()
const savingName = ref(false)

// The person's language is the account's, which the emails read: the
// picker shows it, and a pick stores it whether or not the app switches
// (a pick of the language the app already shows switches nothing, so the
// locale-sync plugin, which stores switches, never sees it).
const languages = useAppLanguages()
const language = computed(() =>
  matchLocale(auth.user.value?.locale as string | undefined, languages.available.value.map(entry => entry.code)) ?? languages.current.value)
async function selectLanguage(code: string) {
  note.value = null
  try {
    const locale = normalizeLocale(code)
    if (locale && auth.user.value && normalizeLocale(auth.user.value.locale) !== locale) {
      await auth.updateUser({ locale })
      // The session carries the stored language before the app switches,
      // so the switch finds nothing left to store.
      await auth.session.value.refetch()
      note.value = { ok: true, text: () => t('languageSaved') }
    }
    await languages.select(code)
  }
  catch (e) {
    fail(e)
  }
}

const initials = computed(() =>
  ((auth.user.value?.name as string | undefined) ?? (auth.user.value?.email as string | undefined) ?? '?')
    .split(/[\s@]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join(''))

function fail(e: unknown) {
  note.value = { ok: false, text: () => errorMessage(e) }
  emit('error', message.value!.text)
}

async function saveName() {
  // A second press while the name saves does nothing; the button keeps focus (`aria-disabled`).
  if (savingName.value) return
  note.value = null
  savingName.value = true
  try {
    await auth.updateUser({ name: name.value.trim() })
    note.value = { ok: true, text: () => t('saved') }
    emit('name-saved', name.value.trim())
  }
  catch (e) {
    fail(e)
  }
  finally {
    savingName.value = false
  }
}

const emailChange = useEmailChange({
  // The prop when the app passes one, else the composable's own shape
  // check: read on every call, so a prop that changes takes effect.
  validateEmail: email => (props.validateEmail ? props.validateEmail(email) : defaultValidateEmail(email)),
  onChanged: (email) => {
    note.value = { ok: true, text: () => t('changed', { email }) }
    emit('email-changed', email)
    emailChange.reset()
  },
})
// A step that failed says why where every other message goes.
watch(emailChange.error, (failure) => {
  if (!failure) return
  fail(failure)
})

// The email change replaces its form at every step. A step the person
// started (a submit, a cancel) moves focus to the new step's field, so a
// keyboard or screen-reader user lands where they type next.
let personMoved = false
// A press while a step runs does nothing: the busy buttons keep focus
// (`aria-disabled`, not `disabled`), so they refuse the press here.
const byPerson = (action: () => unknown) => async () => {
  if (emailChange.isPending.value) return
  personMoved = true
  try {
    await action()
  }
  finally {
    await nextTick()
    personMoved = false
  }
}
watch(emailChange.step, () => {
  if (!personMoved) return
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>('[data-profile="section-email"] input')?.focus()
  })
})

// A refusal of the field in view marks it invalid and describes it with
// the message, which is where every refusal shows.
const messageId = `${id}-message`
const invalid = (field: string) => {
  const error = emailChange.error.value
  return error?.code === 'invalid_input' && (error.data as { field?: unknown }).field === field
}

const context = computed<ProfileSlotContext>(() => ({
  user: auth.user.value,
  role: auth.role.value,
  workspaceName: workspace.current.value?.name ?? null,
  initials: initials.value,
  name,
  message: message.value,
  savingName: savingName.value,
  saveName,
  emailChange,
  preferences,
  languages: languages.available.value,
  language: language.value,
  selectLanguage,
}))

provideProfileView({
  labels,
  context,
  mounted,
  id,
  messageId,
  startChange: byPerson(emailChange.start),
  confirmCurrent: byPerson(emailChange.confirmCurrent),
  verifyNew: byPerson(emailChange.verifyNew),
  cancelChange: byPerson(emailChange.reset),
  fieldState: (field, describedBy) => ({
    'aria-invalid': invalid(field) ? 'true' : undefined,
    'data-invalid': invalid(field) ? '' : undefined,
    'aria-describedby': invalid(field) && message.value ? `${describedBy} ${messageId}` : describedBy,
  }),
})
</script>

<template>
  <div
    ref="root"
    data-profile="root"
    :aria-busy="savingName || emailChange.isPending.value ? 'true' : undefined"
  >
    <slot
      v-if="showIdentity"
      name="identity"
      v-bind="context"
    >
      <ProfileIdentity :account="account" />
    </slot>
    <slot
      name="name"
      v-bind="context"
    >
      <ProfileNameSection :account="account" />
    </slot>
    <slot
      name="email"
      v-bind="context"
    >
      <ProfileEmailSection :email-change="emailChange" />
    </slot>
    <slot
      name="language"
      v-bind="context"
    >
      <ProfileLanguageSection :account="account" />
    </slot>
    <slot
      name="preferences"
      v-bind="context"
    >
      <ProfilePreferencesSection :preferences="preferences" />
    </slot>
    <!-- A failure interrupts (`alert` is implicitly assertive); a confirmation waits its turn as a polite status. -->
    <p
      v-if="message"
      :id="messageId"
      data-profile="message"
      :data-tone="message.ok ? 'ok' : 'error'"
      :role="message.ok ? 'status' : 'alert'"
      :aria-live="message.ok ? 'polite' : undefined"
    >
      {{ message.text }}
    </p>
    <slot
      name="footer"
      v-bind="context"
    />
  </div>
</template>
