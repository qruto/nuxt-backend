<script setup lang="ts">
// Docus 5.15.0's AppHeader (test/docs/docus-copies.test.ts pins the
// source), changed: the keys (Docs · Playground · Agents · GitHub) and the
// version chip take the right side from lg up, the phone menu is a drawer
// that carries them, and Docus's GitHub button is gone (GitHub is a key).
// The search field takes the width the logo and the keys leave. The menu
// toggle is the site's IconMenuToggle, which says whether the menu is open
// (`aria-expanded`) and moves with the site's motion. A status region
// says when the reader picks another package manager (usePackageManager).
const { forced: forcedColorMode } = useDocusColorMode()

const { isEnabled: isAssistantEnabled } = useAssistant()
const { isEnabled, locales } = useDocusI18n()
const { subNavigationMode } = useSubNavigation()
const { announcement } = usePackageManager()
</script>

<template>
  <UHeader
    mode="drawer"
    :ui="{ left: 'lg:flex-none', center: 'flex-1 max-w-sm mx-auto', right: 'lg:flex-none' }"
    :class="{ 'flex flex-col': subNavigationMode === 'header' }"
  >
    <AppHeaderCenter />

    <template #left>
      <AppHeaderLeft />
    </template>

    <template #right>
      <span
        role="status"
        class="sr-only"
      >{{ announcement }}</span>

      <AppHeaderCTA />

      <template v-if="isAssistantEnabled">
        <LazyAssistantChat />
      </template>

      <template v-if="isEnabled && locales.length > 1">
        <ClientOnly>
          <LazyLanguageSelect />

          <template #fallback>
            <div class="h-8 w-8 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
          </template>
        </ClientOnly>

        <USeparator
          orientation="vertical"
          class="h-8"
        />
      </template>

      <UContentSearchButton class="lg:hidden" />

      <ClientOnly v-if="!forcedColorMode">
        <UColorModeButton />

        <template #fallback>
          <div class="h-8 w-8 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </template>
      </ClientOnly>
    </template>

    <template #toggle="{ open, toggle }">
      <IconMenuToggle
        :open="open"
        class="lg:hidden"
        @click="toggle"
      />
    </template>

    <template #body>
      <AppHeaderBody />
    </template>

    <template
      v-if="subNavigationMode === 'header'"
      #bottom
    >
      <LazyAppHeaderBottom />
    </template>
  </UHeader>
</template>
