<script setup lang="ts">
import { HOME_SERVICES } from '~~/shared/home'
import { SITE } from '~~/shared/site'

/**
 * The first screen: the title cut deep into the plate in two lines, what
 * the package is, the one GO key on the page, the install line, and the
 * services the package runs on, milled into one strip under it. Nothing
 * here is live: the homepage never loads the backend client
 * (test/docs/homepage.test.ts), and its playground key prefetches on intent.
 */
const [first, second] = SITE.title.split(', ')
</script>

<template>
  <section class="mx-auto grid w-full max-w-(--ui-container) justify-items-start gap-8 px-4 pt-16 pb-12 sm:px-6 lg:px-8 lg:pt-24">
    <p class="flex items-center gap-3">
      <Strip class="h-1.5 w-10" />
      <span class="stamp">One module · twelve layers · six services</span>
    </p>

    <h1 class="grid gap-1 font-display text-[clamp(2.4rem,7vw,5.25rem)] leading-[1.02] font-bold [font-stretch:118%] uppercase">
      <span
        class="cut-deep"
        :data-text="`${first},`"
      >{{ first }},</span>
      <span
        class="cut-deep"
        :data-text="second"
      >{{ second }}</span>
    </h1>

    <p class="engr-lt max-w-[62ch] text-lg text-pretty">
      {{ SITE.lead }}
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <Key
        to="/docs/start/quickstart"
        signal="go"
      >
        Get started
      </Key>
      <Key to="/docs/start">
        Read the docs
      </Key>
      <Key
        to="/playground"
        prefetch-on="interaction"
      >
        Open the playground
      </Key>
    </div>

    <HomeCommandSlot class="w-full max-w-md" />

    <div class="grid w-full gap-3 pt-4">
      <p class="stamp">
        Under the hood · one layer over all of them
      </p>
      <ul class="slot grid grid-cols-2 gap-1 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <li
          v-for="service in HOME_SERVICES"
          :key="service.name"
          class="grid content-start gap-1 px-3 py-2.5"
        >
          <span class="engr-lt font-display text-base font-bold [font-stretch:112%]">{{ service.name }}</span>
          <span class="text-xs leading-snug text-(--ink-dim)">{{ service.gives }}</span>
        </li>
      </ul>
      <p class="max-w-[70ch] text-sm text-(--ink-dim) text-pretty">
        Your code calls the package, and the package calls them. Each service keeps its own dashboard and
        pricing; none of their SDKs reach your pages.
      </p>
    </div>
  </section>
</template>
