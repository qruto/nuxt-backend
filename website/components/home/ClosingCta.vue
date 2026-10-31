<script setup lang="ts">
import { SITE } from '~~/shared/site'

/**
 * The closing plate: one wide `plaque` with the send-off cut into it in two
 * lines (shared/site.ts), as the hero's title is, the install line milled
 * below and two keys. The hero holds the page's one GO key, so these two are
 * metal: the strip beside the stamp is the plate's only light.
 */
const TITLE = SITE.closing
</script>

<template>
  <section class="mx-auto w-full max-w-(--ui-container) px-4 pt-12 pb-20 sm:px-6 lg:px-8 lg:pb-28">
    <div class="plaque mx-auto grid max-w-4xl justify-items-center gap-6 px-4 py-12 text-center sm:px-12 sm:py-16">
      <p class="flex items-center gap-3">
        <Strip class="h-1.5 w-10" />
        <span class="stamp">Ready in one command</span>
      </p>
      <h2 class="grid justify-items-center gap-1 font-display text-[clamp(1.5rem,6.4vw,2.9rem)] leading-[1.12] font-bold [font-stretch:112%]">
        <span
          v-for="line in TITLE"
          :key="line"
          class="cut"
          :data-text="line"
        >{{ line }}</span>
      </h2>
      <p class="max-w-xl text-(--ink-dim) text-pretty">
        Add <code>nuxt-backend</code> to your modules. The first
        <code>nuxt-backend dev</code> scaffolds the Convex files and fills in
        the environment for you, nothing to set by hand: real-time data and
        Better Auth, working.
      </p>
      <HomeCommandSlot />
      <div class="flex flex-wrap justify-center gap-3">
        <Key to="/docs/start/quickstart">
          <UIcon
            name="i-lucide-arrow-right"
            class="size-3.5"
          />
          Get started
        </Key>
        <Key
          to="/playground"
          prefetch-on="interaction"
        >
          <UIcon
            name="i-lucide-flask-conical"
            class="size-3.5"
          />
          Explore the playground
        </Key>
      </div>
    </div>
  </section>
</template>
