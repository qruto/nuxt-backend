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
.ph { margin-bottom: 1.5rem; }
.ph-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.55rem;
}
.ph-tag {
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent-soft);
  background: var(--sink);
  box-shadow: var(--inset-sm);
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
}
.ph-xp {
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--xp);
  background: var(--xp-dim);
  padding: 0.16rem 0.42rem;
  border-radius: 5px;
}
.ph-live {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ok);
}
.ph-title {
  font-family: var(--display);
  font-size: 2.05rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  margin: 0 0 0.4rem;
  line-height: 1.04;
}
.ph-sub {
  color: var(--ink-dim);
  font-size: 0.88rem;
  margin: 0;
  max-width: 64ch;
  line-height: 1.5;
}
</style>
