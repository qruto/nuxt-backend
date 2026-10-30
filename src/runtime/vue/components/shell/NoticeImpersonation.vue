<script setup lang="ts">
import { computed } from 'vue'
import { reloadNuxtApp } from '#imports'
import { busyAttributes } from '../../a11y'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import { useAuthSession } from '../../utils/auth-session'
import { useHydrated } from '../../utils/hydrated'
import { inLocale } from '../../utils/intl'
import { useShownFirst } from '../../utils/shown-first'
import { VNodes } from '../../utils/vnodes'
import { type ImpersonationNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' first notice: an administrator is acting as the
 * account. Whose account it is, when the visit ends (thirty minutes at
 * most), and the way out, which returns the browser to the administrator's
 * own session and reloads the app at the admin console, so nothing read as
 * the account stays on screen. Nothing for a person's own session.
 *
 * @internal
 */
defineOptions({ name: 'NoticeImpersonation' })
const props = defineProps<{
  /** The `impersonation` slot of `<BackendNotices>`, which replaces the whole notice. */
  slotContent?: (context: ImpersonationNoticeContext) => unknown
}>()
const emit = defineEmits({
  /** The visit ended; the app reloads next. */
  stopped: () => true,
  /** Ending the visit failed: the sentence the notice shows. */
  error: (_message: string) => true,
})

const auth = useAuthSession()
const { t, errorMessage, locale } = useLabels('impersonation')
const adminPath = useBackendPagePath('admin')
const shown = useShownFirst('impersonation')
// The end is a time of day in the browser's own zone, which the server does
// not know: it shows once the notice is in the browser.
const hydrated = useHydrated()
const name = computed(() => {
  const user = auth.user.value as { name?: string, email?: string } | null
  return user?.name || user?.email || ''
})
const endsAt = computed(() => {
  const at = (auth.session.value.data?.session as { expiresAt?: unknown } | undefined)?.expiresAt
  const time = at == null ? Number.NaN : new Date(at as string | number | Date).getTime()
  return Number.isFinite(time) ? time : null
})
const ends = computed(() => endsAt.value === null || !hydrated.value ? null : inLocale(locale.value, tag => new Date(endsAt.value!).toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' })))

async function stop(): Promise<void> {
  if (auth.isPending.value) return
  try {
    await auth.stopImpersonating()
  }
  catch (cause) {
    // The session keeps the failure in its `error`, which the notice shows.
    emit('error', errorMessage(cause))
    return
  }
  emit('stopped')
  reloadNuxtApp({ path: adminPath.value ?? '/', force: true })
}
const context = computed<ImpersonationNoticeContext>(() => ({ name: name.value, endsAt: endsAt.value, isPending: auth.isPending.value, stop }))
</script>

<template>
  <aside
    v-if="auth.isImpersonating.value && shown && !turnedOff(props.slotContent, context)"
    data-impersonation="banner"
    :aria-label="t('label')"
    :aria-busy="auth.isPending.value ? 'true' : undefined"
  >
    <VNodes
      v-if="props.slotContent"
      :nodes="props.slotContent(context) as never"
    />
    <template v-else>
      <p data-impersonation="message">
        {{ t('message', { name }) }}
      </p>
      <p
        v-if="ends"
        data-impersonation="ends"
      >
        {{ t('ends', { time: ends }) }}
      </p>
      <button
        data-impersonation="stop"
        type="button"
        v-bind="busyAttributes(auth.isPending.value)"
        @click="stop"
      >
        {{ auth.isPending.value ? t('stopping') : t('stop') }}
      </button>
      <p
        v-if="auth.error.value"
        data-impersonation="error"
        role="alert"
      >
        {{ errorMessage(auth.error.value) }}
      </p>
    </template>
  </aside>
</template>
