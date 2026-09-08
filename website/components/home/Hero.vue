<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * The first screen — the headline engraved straight into the matte titanium
 * slab. No window fiction, no props: the material IS the hero. Below the
 * carved wordmark: the install command milled into a slot, and a live proof
 * line driven by the real Convex connection this page runs on.
 */

// Real Convex connection (client-only — no socket during prerender).
const conn = import.meta.client ? useConvexConnectionState() : null
const mounted = ref(false)
const connected = computed(() => mounted.value && !!conn?.value.isWebSocketConnected)
onMounted(() => {
  mounted.value = true
})

const specs = ['Auth', 'Real-time', 'Billing', 'Email', 'Workflows', 'Search', 'SSR']
</script>

<template>
  <section class="hero">
    <p class="hero__eyebrow">
      Real-time Convex backend for Nuxt
    </p>

    <h1 class="hero__title engraved">
      The backend your<br>Nuxt app was missing.
    </h1>

    <p class="hero__lead">
      One package ships a Nuxt module and a Convex auth component with
      <strong>Better Auth</strong> built in — real-time data, SSR-safe auth,
      and batteries-included backend components.
    </p>

    <div class="hero__row">
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
        Open the playground
      </NuxtLink>
      <a
        href="https://github.com/qruto/nuxt-backend"
        target="_blank"
        rel="noopener"
        class="hbtn hbtn--ghost"
      >
        <UIcon name="i-simple-icons-github" />
        GitHub
      </a>
    </div>

    <HomeCommandSlot class="hero__cmd" />

    <p
      class="hero__proof"
      aria-live="polite"
    >
      <span
        class="hero__led"
        :class="{ on: connected }"
      />
      <span v-if="connected">Live on Convex · 0 servers to run</span>
      <span v-else>Connecting to Convex…</span>
    </p>

    <p class="hero__specs engraved-sm">
      <template
        v-for="(s, i) in specs"
        :key="s"
      >
        <span
          v-if="i"
          class="hero__dot"
          aria-hidden="true"
        >·</span>
        <span class="hero__spec">{{ s }}</span>
      </template>
    </p>
  </section>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: calc(100svh - 4rem);
  padding: clamp(3.5rem, 8vw, 6rem) 1.25rem clamp(3rem, 6vw, 4.5rem);
}

/* Crisp, not engraved: 0.72rem sits under design.md §2.5's ≥0.8rem engraving
   floor, so the eyebrow reads in plain dim ink. */
.hero__eyebrow {
  margin: 0 0 1.4rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.hero__title {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(2.6rem, 6.5vw, 4.75rem);
  letter-spacing: -0.01em;
  line-height: 1.06;
}

.hero__lead {
  margin: 1.6rem auto 0;
  max-width: 38rem;
  font-size: 1.06rem;
  line-height: 1.65;
  color: var(--ink-dim);
}
.hero__lead strong { color: var(--ink); font-weight: 700; }

.hero__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 2rem;
}
.hero__cmd { margin-top: 2.1rem; }

/* The proof line swaps its text once the socket connects. Both strings are
   kept short enough (≤ 33 chars at 0.74rem mono) to stay on one line down to
   a 320px viewport, so the swap never adds a line — and the box is reserved
   up front so the mount never shifts layout (CLS). */
.hero__proof {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.3rem 0 0;
  min-height: 1.5em;
  font-family: var(--mono);
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--ink-dim);
}
.hero__led {
  flex: none; /* the flex algorithm must never squash the dot */
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--sink);
  box-shadow: var(--inset-1);
  transition: background var(--transition), box-shadow var(--transition);
}
.hero__led.on { background: var(--ok); box-shadow: var(--glow-ok); }

/* The spec line — capabilities engraved straight into the slab. */
.hero__specs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: 0.7rem;
  row-gap: 0.3rem;
  margin: clamp(2.4rem, 5vw, 3.6rem) 0 0;
  font-family: var(--mono);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.hero__dot { user-select: none; }
</style>
