<script setup lang="ts">
// Where the playground lands before it has a deployment (see
// middleware/playground-offline.global.ts). Standalone like /login: the
// playground shell itself subscribes to the backend.
definePageMeta({ layout: false })
</script>

<template>
  <main class="page bk-depth">
    <div class="card">
      <div class="brand">
        <span
          class="mark"
          aria-hidden="true"
        >▲</span>
        <div class="brandtext">
          <span class="name">Nuxt backend</span>
          <span class="sub">playground</span>
        </div>
      </div>
      <h1>No backend yet</h1>
      <p>
        The playground runs on a Convex deployment of your own. Start it with
        <code>npm run dev</code>: the first run creates a dev deployment,
        provisions its environment and starts Convex and Nuxt together.
      </p>
      <div class="actions">
        <a href="https://nuxt-backend.dev/playground">
          <LabButton>Open the live playground</LabButton>
        </a>
        <a href="https://nuxt-backend.dev/getting-started/introduction">
          <LabButton variant="secondary">
            Read the docs
          </LabButton>
        </a>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
}

.card {
  width: min(28rem, 100%);
  padding: 1.6rem;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--raise-lg);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1.1rem;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: var(--r-sm);
  color: var(--bg);
  font-size: 0.9rem;
  background: linear-gradient(135deg, var(--ink-dim), var(--ink) 70%);
  box-shadow: var(--elev-1), inset 1px 1px 0 light-dark(rgb(255 255 255 / 0.28), rgb(255 255 255 / 0.55));
}

.brandtext {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.name {
  font-family: var(--display);
  font-weight: 700;
}

.sub {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

h1 {
  margin: 0 0 0.5rem;
  font-family: var(--display);
  font-size: 1.25rem;
  font-weight: 700;
}

p {
  margin: 0 0 1.2rem;
  color: var(--ink-dim);
  line-height: 1.5;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.actions a {
  text-decoration: none;
}
</style>
