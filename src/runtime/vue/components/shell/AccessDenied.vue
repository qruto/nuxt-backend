<script setup lang="ts">
import { computed, h, onMounted, ref, shallowRef, useId } from 'vue'
import { clearError, navigateTo, useError, useRoute, useRuntimeConfig } from '#imports'
import { busyAttributes } from '../../a11y'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { refusalText, useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { ACCESS_DENIED_REASONS, type AccessDeniedReason } from '../../utils/access-rules'
import { useAuthSession } from '../../utils/auth-session'
import { focusDropped, returnFocus } from '../../utils/focus-return'
import { accessDeniedData, sitePath } from '../../utils/page-access'
import { shareablePath } from '../../utils/session-end'
import { VNodes } from '../../utils/vnodes'
import { type AccessDeniedSlotContext, type AccessDeniedSlots, isPlainClick } from './access-denied'

/**
 * What a signed-in person sees when a page is not open to them: the page
 * guard's 403 (`definePageMeta({ auth: { role, workspace, feature } })`)
 * on the module's error page or your app's `error.vue`, or a refusal of your
 * own. It says why in the words of the rule they failed, who is signed in,
 * and offers the ways on: the home page, the workspace switcher when a
 * workspace role was missing, and signing in with another account, which
 * comes back here.
 *
 * `data-access` attributes for styling, a slot per region, and its copy
 * from the `access` labels. Rendered as the error page with keyboard focus
 * dropped (the link that led here is gone), it moves focus to its heading.
 *
 * @example
 * ```vue [error.vue]
 * <template>
 *   <main>
 *     <AccessDenied v-if="error.status === 403" :error="error" />
 *     <p v-else>{{ error.statusText }}</p>
 *   </main>
 * </template>
 * ```
 */
defineOptions({ name: 'AccessDenied' })

const props = withDefaults(defineProps<{
  /**
   * The error page's `error`: the guard's 403 names the rule and the page
   * in its `data`; another 403 rendered on the server, the page in its `url`.
   */
  error?: { data?: unknown, url?: string } | null
  /** The rule the person failed, over the one `error` names. */
  reason?: AccessDeniedReason
  /** Where the home link goes. Default: `redirects.afterSignIn`. */
  home?: string
  /** Copy for this component, over `appConfig.backend.labels.access` and the translations. */
  labels?: LabelOverrides<BackendLabels['access']>
}>(), { error: null, reason: undefined, home: undefined, labels: undefined })

const emit = defineEmits({
  'signed-out': () => true,
  'error': (_message: string) => true,
})
defineSlots<AccessDeniedSlots>()

if (import.meta.dev && props.reason !== undefined && !(ACCESS_DENIED_REASONS as readonly string[]).includes(props.reason)) {
  console.warn(`[nuxt-backend] <AccessDenied reason="${props.reason}">: the reason is one of ${ACCESS_DENIED_REASONS.join(', ')}.`)
}

const auth = useAuthSession()
const labels = useLabels('access', () => props.labels)
const { t, rich } = labels
const loginPath = useBackendPagePath('login')
const settingsPath = useBackendPagePath('settings')
const afterSignIn = (useRuntimeConfig().public.backend as { redirects?: { afterSignIn?: string } } | undefined)?.redirects?.afterSignIn ?? '/'
const route = useRoute()
const shownError = useError()
const titleId = `${useId()}-title`
const title = ref<HTMLElement | null>(null)
const data = computed(() => accessDeniedData(props.error))
const reason = computed(() => props.reason ?? data.value?.reason)
// The page asked for: the guard's own record of it, else the page a server
// render failed at (the error's `url`), else the current route.
const path = computed(() => {
  if (data.value) return data.value.path
  return shareablePath({ fullPath: sitePath(props.error?.url) ?? route.fullPath })
})
const home = computed(() => props.home ?? afterSignIn)
const email = computed(() => (auth.isAuthenticated.value ? auth.user.value?.email ?? null : null))
const pending = ref(false)
// Why signing out failed, worded when it renders.
const failed = shallowRef<(() => string) | null>(null)

// Off the error page through the router, which clears the error, when one
// is showing; a plain navigation otherwise.
const go = (to: string): Promise<unknown> => (shownError.value ? clearError({ redirect: to }) : Promise.resolve(navigateTo(to)))
function follow(event: MouseEvent, to: string): void {
  if (!isPlainClick(event)) return
  event.preventDefault()
  void go(to)
}

async function switchAccount(): Promise<void> {
  // A second press while signing out does nothing; the button keeps focus (`aria-disabled`).
  if (pending.value) return
  pending.value = true
  failed.value = null
  try {
    await auth.signOut()
  }
  catch (failure) {
    failed.value = () => refusalText(labels, failure, t('switchAccountFailed'))
    emit('error', failed.value())
    pending.value = false
    return
  }
  emit('signed-out')
  try {
    await go(`${loginPath.value ?? ''}?redirect=${encodeURIComponent(path.value)}`)
  }
  finally {
    pending.value = false
  }
}

// As the error page, it is the page: when the link that led here went away
// with focus, the heading takes it. Placed in a page, it leaves focus be.
onMounted(() => {
  if (shownError.value && focusDropped()) returnFocus(title.value)
})

const context = computed<AccessDeniedSlotContext>(() => ({
  reason: reason.value,
  path: path.value,
  home: home.value,
  email: email.value,
  pending: pending.value,
  switchAccount,
}))
const signedInAs = computed(() => (email.value ? rich('signedInAs', { email: h('strong', email.value) }) : null))
</script>

<template>
  <section
    data-access="root"
    :aria-labelledby="titleId"
    :aria-busy="pending ? 'true' : undefined"
  >
    <h1
      :id="titleId"
      ref="title"
      data-access="title"
      tabindex="-1"
    >
      <slot
        name="title"
        v-bind="context"
      >
        {{ t('title') }}
      </slot>
    </h1>
    <div data-access="message">
      <slot
        name="message"
        v-bind="context"
      >
        <p data-access="reason">
          {{ reason === 'workspace' ? t('messageWorkspace') : reason === 'banned' ? t('messageBanned') : t('message') }}
        </p>
        <p
          v-if="signedInAs"
          data-access="account"
        >
          <VNodes :nodes="signedInAs" />
        </p>
      </slot>
    </div>
    <div data-access="actions">
      <slot
        name="actions"
        v-bind="context"
      >
        <a
          data-access="home"
          :href="home"
          @click="follow($event, home)"
        >{{ t('home') }}</a>
        <a
          v-if="reason === 'workspace' && settingsPath"
          data-access="switch-workspace"
          :href="settingsPath"
          @click="follow($event, settingsPath)"
        >{{ t('switchWorkspace') }}</a>
        <button
          v-if="email"
          data-access="switch-account"
          type="button"
          v-bind="busyAttributes(pending)"
          @click="switchAccount"
        >
          {{ pending ? t('switchingAccount') : t('switchAccount') }}
        </button>
      </slot>
    </div>
    <p
      v-if="failed"
      data-access="error"
      role="alert"
    >
      {{ failed() }}
    </p>
  </section>
</template>
