<script setup lang="ts">
// The frame of the app: the header with your brand, the workspace switcher,
// the notification bell and the account menu, then the app-wide notices and
// your page. Put your links in the `nav` slot, and your buttons before the
// account menu in `actions`. `<AppShell :switcher="false">` hides the
// switcher for an app whose people never share a workspace.
const { brand } = useBackendConfig()
</script>

<template>
  <AppShell>
    <template #brand>
      <NuxtLink to="/">
        {{ brand.name || 'Your app' }}
      </NuxtLink>
    </template>
    <slot />
  </AppShell>
</template>
