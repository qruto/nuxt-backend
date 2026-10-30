<script setup lang="ts">
import { HOME_TRAITS } from '~~/shared/home'

/**
 * What being one package means, in six plates: each trait in a line or
 * two, with one key into the page that proves it. The last is the agent
 * kit, kept to a plate.
 */
</script>

<template>
  <section class="mx-auto grid w-full max-w-(--ui-container) gap-8 px-4 py-12 sm:px-6 lg:px-8">
    <div class="grid max-w-[62ch] gap-3">
      <p class="stamp">
        All in one
      </p>
      <EngravedTitle
        text="One package, not twelve integrations."
        class="font-display text-3xl font-bold [font-stretch:112%] sm:text-4xl"
      />
      <p class="engr-lt text-pretty">
        The services stay best in class. What you stop writing is the glue between them: the webhooks, the
        retries, the pages and the checks that every app rebuilds.
      </p>
    </div>

    <ul class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="trait in HOME_TRAITS"
        :key="trait.title"
        class="plaque grid content-start gap-3 p-6"
      >
        <h3 class="font-display text-lg font-bold [font-stretch:112%]">
          {{ trait.title }}
        </h3>
        <p class="text-sm text-(--ink-dim) text-pretty">
          {{ trait.body }}
        </p>
        <Key
          :to="trait.link.to"
          size="xs"
          class="justify-self-start"
        >
          {{ trait.link.label }}
        </Key>
      </li>
    </ul>
  </section>
</template>
