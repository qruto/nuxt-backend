<script setup lang="ts">
import { SITE } from '~~/shared/site'

/**
 * The first screen: the title engraved into the plate in two lines, what
 * the package is, the one GO key on the page, and the install line. Nothing
 * here is live: the homepage never loads the backend client
 * (test/docs/homepage.test.ts), and its playground key prefetches on intent.
 */
const [first, second] = SITE.title.split(', ')
</script>

<template>
  <section class="mx-auto grid w-full max-w-(--ui-container) justify-items-start gap-8 px-4 pt-16 pb-12 sm:px-6 lg:px-8 lg:pt-24">
    <p class="flex items-center gap-3">
      <Strip class="h-1.5 w-10" />
      <span class="stamp">One module · every service · three signals</span>
    </p>

    <h1 class="grid gap-1 font-display text-[clamp(2.4rem,7vw,5.25rem)] leading-[1.02] font-bold [font-stretch:118%] uppercase">
      <span
        class="cut"
        :data-text="`${first},`"
      >{{ first }},</span>
      <span
        class="cut"
        :data-text="second"
      >{{ second }}</span>
    </h1>

    <p class="max-w-[62ch] text-lg text-(--ink-dim) text-pretty">
      One Nuxt module and one Convex component: passwordless sign-in,
      workspaces, billing with credits, transactional email and an endpoint
      your users' agents can call. One command checks every one of them.
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
  </section>
</template>
