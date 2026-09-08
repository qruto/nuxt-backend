<script setup lang="ts">
/**
 * Header brand — overrides Docus's logo (which showed the bare favicon image).
 * The coin (/logo.svg — a round matte titanium plaque with the stack glyph
 * engraved in and one green status LED) + the product name "Nuxt backend".
 * The parent AppHeaderLeft already wraps this in a NuxtLink to "/", so no
 * link here. The explicit light/dark coins follow the site's colour-mode
 * toggle (an SVG's own prefers-color-scheme would follow the OS instead).
 */
</script>

<template>
  <span class="brand">
    <UColorModeImage
      light="/logo-light.svg"
      dark="/logo-dark.svg"
      alt=""
      aria-hidden="true"
      class="brand__mark h-8 w-8"
      width="32"
      height="32"
    />
    <span class="brand__text embossed-sm">Nuxt backend</span>
  </span>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  height: 100%;
}
.brand__mark {
  display: block;
  flex: none;
}
.brand__text {
  font-family: var(--display);
  font-size: 1.02rem;
  font-weight: 600;
  /* The squared display wants air, not the old rounded-negative tracking. */
  letter-spacing: 0.02em;
  color: var(--ink);
  /* raised via the `.embossed-sm` utility (contrast kill-switch aware) */
  white-space: nowrap;
}
@media (max-width: 420px) {
  .brand__text { display: none; }
}
</style>
