<script setup lang="ts">
import { HOME_MODULES, type HomeModule } from '~~/shared/home'

/**
 * The twelve app layers as a bank of plaques, each one key into its docs:
 * what the layer gives an app, and a light for how far 0.2.0 takes it. A
 * layer that is mostly planned says so in words beside its light, never by
 * colour alone.
 */
const LIGHT: Record<HomeModule['status'], { tone: 'ok' | 'warn' | 'off', word?: string }> = {
  available: { tone: 'ok' },
  experimental: { tone: 'warn', word: 'Experimental' },
  planned: { tone: 'off', word: 'Planned' },
}
</script>

<template>
  <section class="mx-auto grid w-full max-w-(--ui-container) gap-8 px-4 py-12 sm:px-6 lg:px-8">
    <div class="grid max-w-[62ch] gap-3">
      <p class="stamp">
        Twelve layers · one package
      </p>
      <EngravedTitle
        text="Everything behind a client app."
        class="font-display text-3xl font-bold [font-stretch:112%] sm:text-4xl"
      />
      <p class="engr-lt text-pretty">
        Each layer is a part of the backend a product needs before its first user signs in. Every one has its
        pages, its components and its checks, and turns on when its key is set.
      </p>
    </div>

    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <li
        v-for="module in HOME_MODULES"
        :key="module.layer"
      >
        <NuxtLink
          :to="module.docs"
          class="plaque grid h-full content-start gap-2 p-5"
        >
          <span class="flex items-center gap-2.5">
            <Led :tone="LIGHT[module.status].tone" />
            <span class="font-display text-lg font-bold [font-stretch:112%]">{{ module.title }}</span>
            <span
              v-if="LIGHT[module.status].word"
              class="stamp ms-auto"
            >{{ LIGHT[module.status].word }}</span>
          </span>
          <span class="text-sm leading-snug text-(--ink-dim) text-pretty">{{ module.gives }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
