<script setup lang="ts">
/**
 * The header's mark and wordmark, in place of Docus's logo menu. The mark
 * is the machined plate with its three tritium bars; the light and dark
 * files follow the site's colour-mode toggle (an SVG's own
 * prefers-color-scheme would follow the OS instead). AppHeaderLeft wraps
 * this in the link home. The wordmark drops out on the narrowest phones.
 */
</script>

<template>
  <span class="inline-flex h-full items-center gap-2.5">
    <UColorModeImage
      light="/logo-light.svg"
      dark="/logo-dark.svg"
      alt=""
      aria-hidden="true"
      class="block size-8 flex-none"
      width="32"
      height="32"
    />
    <span class="font-display text-[1.02rem] font-bold tracking-[0.01em] whitespace-nowrap text-(--ink) emb-sm [font-stretch:118%] max-[420px]:hidden">nuxt-backend</span>
  </span>
</template>
