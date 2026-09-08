<script setup lang="ts">
/**
 * Closing call-to-action — the shipping plate: one wide convex plaque with
 * the send-off engraved into it and the install command milled below,
 * bookending the hero's carved wordmark.
 */
</script>

<template>
  <section class="cta">
    <div class="cta__plate plaque noise">
      <p class="cta__eyebrow engraved-sm">
        Ready in one command
      </p>
      <h2 class="cta__title engraved">
        Install the module.<br>Run convex dev. Ship.
      </h2>
      <p class="cta__lead">
        Add <code>nuxt-backend</code> to your modules, set two env vars, and the
        first run scaffolds the Convex files for you — real-time data and Better
        Auth, working.
      </p>
      <HomeCommandSlot class="cta__cmd" />
      <div class="cta__row">
        <NuxtLink
          to="/getting-started/introduction"
          class="hbtn hbtn--primary"
        >
          <UIcon name="i-lucide-arrow-right" />
          Get started
        </NuxtLink>
        <NuxtLink
          to="/playground"
          class="hbtn"
        >
          <UIcon name="i-lucide-flask-conical" />
          Explore the playground
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta { padding: clamp(2rem, 6vw, 5rem) 1.25rem clamp(4rem, 9vw, 7rem); }
.cta__plate {
  max-width: 56rem;
  margin: 0 auto;
  padding: clamp(2.4rem, 5vw, 3.75rem) clamp(1.5rem, 4vw, 3rem);
  text-align: center;
}

.cta__eyebrow {
  margin: 0 0 1.1rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.cta__title {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(1.85rem, 4.5vw, 2.9rem);
  letter-spacing: -0.005em;
  line-height: 1.12;
}

.cta__lead {
  margin: 1.1rem auto 0;
  max-width: 36rem;
  font-size: 1.02rem;
  line-height: 1.6;
  color: var(--ink-dim);
}
.cta__lead code { font-family: var(--mono); font-size: 0.9em; color: var(--ok-soft); }

.cta__cmd { margin-top: 1.7rem; }

.cta__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1.6rem;
}
</style>
