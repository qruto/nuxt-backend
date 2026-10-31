<script setup lang="ts">
// The frame of the app: `<AppShell>` renders the header, the workspace
// switcher, the notification bell, the account menu and every app-wide
// notice, and wraps the page in <main>; Panels fills its slots. Links go by route name, and to a packaged page by
// useBackendPagePath, so the same files work wherever the app is mounted.
const pricing = useBackendPagePath('pricing')
// The active workspace's balance, live: credits belong to the workspace,
// so a visitor who is not signed in has none to show.
const { isSignedIn } = useAuth()
const credits = useCredits({ meter: 'credits' })
</script>

<template>
  <AppShell switcher>
    <template #brand>
      <NuxtLink :to="{ name: 'strips' }">
        Panels
      </NuxtLink>
    </template>
    <template #nav>
      <NuxtLink :to="{ name: 'strips' }">
        Strips
      </NuxtLink>
      <NuxtLink
        v-if="pricing"
        :to="pricing"
      >
        Credits
      </NuxtLink>
      <NuxtLink :to="{ name: 'notifications' }">
        Notifications
      </NuxtLink>
    </template>
    <template #actions>
      <NuxtLink
        v-if="pricing && isSignedIn"
        :to="pricing"
      >
        {{ credits.balance.value ?? '…' }} credits
      </NuxtLink>
    </template>
    <slot />
  </AppShell>
</template>
