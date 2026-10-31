<script setup lang="ts">
import { isLocalSite } from '~~/shared/backend-probe'
import { returnPath } from '~~/shared/playground-offline'

// Where a build without a deployment, or with one that is not there, lands
// playground visitors (see shared/playground-offline.ts). Standalone like
// /login: no playground shell — the shell itself subscribes to the backend.
definePageMeta({ layout: false, header: false, footer: false })

const LIVE_ORIGIN = 'https://nuxt-backend.dev'
const live = `${LIVE_ORIGIN}/playground`

// A build that names a deployment, but reached this page: that deployment
// was not there. One that names none serves the docs only.
const siteUrl = useRuntimeConfig().public.convex?.siteUrl
const configured = Boolean(siteUrl)
// A deployment on this machine (a stopped `pnpm try`, a dev server): the
// page says how to start it again. Anywhere else it says to try again soon.
const local = import.meta.dev || (configured && isLocalSite(siteUrl!))
// The live playground is elsewhere only when this is not the live site.
const elsewhere = useRequestURL().origin !== LIVE_ORIGIN
// The page the visitor asked for, to ask the deployment again (a full load, so the server asks).
const retry = returnPath(useRoute().query.from)
</script>

<template>
  <main class="pg-shell grid min-h-dvh place-items-center px-4 py-8">
    <div class="plaque grid w-full max-w-[28rem] gap-5 p-6">
      <Nameplate sub="playground" />
      <div
        v-if="configured"
        class="grid gap-2"
      >
        <EngravedTitle
          as="h1"
          text="The backend is not answering"
          size="sm"
          class="font-display text-2xl font-bold"
        />
        <p
          v-if="local"
          class="text-(--ink-dim)"
        >
          This build's Convex deployment did not answer, so the live demos have
          nothing to talk to. A local deployment runs only while its dev server
          does: start it again (<code>pnpm try</code> in the repository), then
          try again.
        </p>
        <p
          v-else
          class="text-(--ink-dim)"
        >
          The playground's backend is not answering right now, so the live
          demos have nothing to talk to. Try again in a moment.
        </p>
      </div>
      <div
        v-else
        class="grid gap-2"
      >
        <EngravedTitle
          as="h1"
          text="No backend on this deployment"
          size="sm"
          class="font-display text-2xl font-bold"
        />
        <p class="text-(--ink-dim)">
          This build serves the docs only — it was made without a Convex
          deployment, so the live demos have nothing to talk to. The playground
          runs on the production site.
        </p>
      </div>
      <div class="grid gap-3 min-[480px]:flex min-[480px]:flex-wrap">
        <!-- The one primary key: ask this build's deployment again, or go
             where the playground runs. -->
        <Key
          :to="configured ? retry : live"
          :external="configured"
          signal="go"
          class="w-full min-[480px]:w-auto"
        >
          {{ configured ? 'Try again' : 'Open the live playground' }}
        </Key>
        <Key
          v-if="configured && elsewhere"
          :to="live"
          class="w-full min-[480px]:w-auto"
        >
          Open the live playground
        </Key>
        <Key
          to="/docs/start"
          class="w-full min-[480px]:w-auto"
        >
          Read the docs
        </Key>
      </div>
    </div>
  </main>
</template>
