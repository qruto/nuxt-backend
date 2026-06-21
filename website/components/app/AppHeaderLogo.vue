<script setup lang="ts">
/**
 * Header brand — overrides Docus's logo (which showed the bare favicon image).
 * A rounded, depth-lit mark + the product name "Nuxt backend". The parent
 * AppHeaderLeft already wraps this in a NuxtLink to "/", so no link here.
 */
</script>

<template>
  <span class="brand">
    <span
      class="brand__mark"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
      >
        <path
          d="M50 20 82 38 50 56 18 38Z"
          fill="#fff"
        />
        <path
          d="M18 50 50 68 82 50"
          stroke="#fff"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.8"
        />
        <path
          d="M18 62 50 80 82 62"
          stroke="#fff"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.5"
        />
      </svg>
    </span>
    <span class="brand__text">Nuxt backend</span>
  </span>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  height: 100%;
}
.brand__mark {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.55rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-press));
  box-shadow: var(--elev-1), inset 1px 1px 0 rgb(255 255 255 / 0.4);
  flex: none;
}
.brand__mark svg { width: 1.05rem; height: 1.05rem; }
.brand__text {
  font-family: var(--display);
  font-size: 1.02rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  white-space: nowrap;
}
@media (max-width: 420px) {
  .brand__text { display: none; }
}
</style>
