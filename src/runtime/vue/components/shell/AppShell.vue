<script setup lang="ts">
import { computed, provide, resolveComponent } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useAppShell } from '../../composables/use-app-shell'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { type AppShellSlots, IN_APP_SHELL } from './app-shell'

/**
 * The frame of a signed-in app, for your layout: a header with your brand
 * and links, the workspace switcher, the notification bell and the account
 * menu, then the app-wide notices, then your page in the `<main>` landmark,
 * with the consent dialog and the connection status closing it. Signed out
 * it shows your brand, your links and a sign-in link. The menus are
 * disclosures on the browser's native popover, placed with CSS anchor
 * positioning. The packaged pages inside it leave the header, the notices
 * and the landmark to the shell. The logic is `useAppShell`.
 *
 * @example
 * ```vue
 * <AppShell>
 *   <template #brand><NuxtLink to="/">Panels</NuxtLink></template>
 *   <template #nav><NuxtLink to="/strips">Strips</NuxtLink></template>
 *   <slot />
 * </AppShell>
 * ```
 */
defineOptions({ name: 'AppShell' })

const props = withDefaults(defineProps<{
  /** Show the workspace switcher. Turn it off in an app whose people never share a workspace. Read when the shell is set up. */
  switcher?: boolean
  /** Copy for the shell, over `appConfig.backend.labels.shell` and the translations. */
  labels?: LabelGroupOverrides<'shell'>
}>(), { switcher: true, labels: undefined })

defineEmits({})
const slots = defineSlots<AppShellSlots>()
const hasNav = computed(() => Boolean(slots.nav))

provide(IN_APP_SHELL, true)

const shell = useAppShell({ switcher: () => props.switcher, labels: () => props.labels })
const { t } = shell.labels

// The bell is the package's `<NotificationInbox>` once an app uses notifications:
// the module publishes whether that component is registered, so an app without
// it renders no bell and resolves nothing.
const registered = (useRuntimeConfig().public.backend as { notificationInbox?: boolean } | undefined)?.notificationInbox === true
const inbox = registered ? resolveComponent('NotificationInbox') : null

const state = computed(() => (shell.isLoading.value ? 'loading' : 'ready'))
</script>

<template>
  <div
    data-shell="root"
    :data-state="state"
    :data-auth="shell.isSignedIn.value ? 'signed-in' : 'signed-out'"
    :aria-busy="shell.isLoading.value ? 'true' : undefined"
  >
    <a
      data-shell="skip"
      :href="`#${shell.mainId}`"
    >{{ t('skip') }}</a>
    <header data-shell="header">
      <div data-shell="brand">
        <slot name="brand" />
      </div>
      <nav
        v-if="hasNav"
        data-shell="nav"
        :aria-label="t('navigation')"
      >
        <slot name="nav" />
      </nav>
      <div data-shell="end">
        <slot name="actions" />
        <template v-if="shell.isSignedIn.value">
          <WorkspaceSwitcher
            v-if="shell.switcher"
            :shell="shell"
          />
          <component
            :is="inbox"
            v-if="inbox && typeof inbox !== 'string'"
          />
          <AccountMenu :shell="shell" />
        </template>
        <NuxtLink
          v-else-if="!shell.isLoading.value && shell.login.value"
          data-shell="sign-in"
          :to="shell.login.value"
        >
          {{ t('signIn') }}
        </NuxtLink>
      </div>
    </header>
    <p
      role="status"
      aria-live="polite"
      data-shell="status"
    >
      {{ shell.isLoading.value ? t('loading') : '' }}
    </p>
    <BackendNotices />
    <main
      :id="shell.mainId"
      data-shell="main"
      tabindex="-1"
    >
      <slot />
      <!-- A required consent waits behind a dialog on every page: the dialog is modal, so it sits anywhere in the page. -->
      <ConsentPrompt />
      <div
        data-shell="status-region"
        data-backend-region="status"
      >
        <ConnectionStatus />
      </div>
    </main>
  </div>
</template>
