<script setup lang="ts">
// Docus 5.15.0's AppFooter (test/docs/docus-copies.test.ts pins the
// source), changed: the project's pages sit between the copyright and the
// icons.
const { github } = useAppConfig()
</script>

<template>
  <UFooter>
    <template #left>
      <AppFooterLeft />
    </template>

    <nav
      aria-label="Project"
      class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
    >
      <ULink to="/docs/ship/releases/stability">
        Stability
      </ULink>
      <ULink to="/docs/ship/releases/changelog">
        Changelog
      </ULink>
      <ULink
        v-if="github"
        :to="`${github.url}/blob/${github.branch}/CONTRIBUTING.md`"
        target="_blank"
      >
        Contributing
      </ULink>
    </nav>

    <template #right>
      <AppFooterRight />
    </template>
  </UFooter>
</template>
