<script setup lang="ts">
withDefaults(defineProps<{
  tag: string
  title: string
  live?: boolean
  experimental?: boolean
}>(), { live: false, experimental: false })
</script>

<template>
  <header class="ph">
    <div class="ph-row">
      <code class="ph-tag">{{ tag }}</code>
      <span
        v-if="experimental"
        class="ph-xp"
      >experimental</span>
      <span
        v-if="live"
        class="ph-live"
      >
        <SignalDot tone="ok" />
        live
      </span>
    </div>
    <h1 class="ph-title">
      {{ title }}
    </h1>
    <p class="ph-sub">
      <slot />
    </p>
  </header>
</template>

<style scoped>
.ph { margin-bottom: 1.35rem; }
.ph-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.45rem;
}
.ph-tag {
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  padding: 0.14rem 0.48rem;
  border-radius: 4px;
}
.ph-xp {
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--xp);
  background: var(--xp-dim);
  border: 1px solid color-mix(in srgb, var(--xp) 28%, transparent);
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
}
.ph-live {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ok);
}
.ph-title {
  font-size: 1.42rem;
  font-weight: 750;
  letter-spacing: -0.022em;
  margin: 0 0 0.3rem;
  line-height: 1.08;
}
.ph-sub {
  color: var(--ink-dim);
  font-size: 0.88rem;
  margin: 0;
  max-width: 64ch;
  line-height: 1.5;
}
</style>
