<script setup lang="ts">
/**
 * Every part of the vocabulary on one page (design.md §Parts), served by
 * `nuxt dev` only: nuxt.config.ts ignores this file in production builds.
 * Toggle the theme with Docus's switch or `?qa=dark` / `?qa=light`, and
 * check `?qa=contrast` for the relief kill-switch. test/docs/design-parts.test.ts
 * fails when a part is declared but missing here.
 */
definePageMeta({ layout: false, header: false, footer: false })
useSeoMeta({ title: 'Parts', robots: 'noindex, nofollow' })

const pressed = ref(true)
</script>

<template>
  <main class="min-h-dvh px-4 py-10 font-sans text-(--ink) [background:var(--matte-bg)] sm:px-8">
    <div class="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12">
      <header class="grid gap-3">
        <span class="stamp">nuxt-backend.dev · dev only</span>
        <EngravedTitle
          as="h1"
          text="Parts"
          class="text-6xl font-extrabold uppercase"
        />
        <p class="max-w-[68ch] text-(--ink-dim)">
          The vocabulary every page is built from: faces, wells, chrome, relief, keys, lights and the LCD. Each is one class; modifiers set what the part reads.
        </p>
      </header>

      <section class="grid gap-4">
        <h2 class="stamp">
          Faces
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="plaque grid gap-2 p-6">
            <span class="stamp">plaque</span>
            <p>A raised panel: a card, a surround link, a demo.</p>
          </div>
          <a
            href="#faces"
            class="plaque grid gap-2 p-6"
          >
            <span class="stamp">a.plaque</span>
            <span>A link plaque lifts on hover.</span>
          </a>
          <div class="unit grid gap-2 p-6 md:col-span-2">
            <span class="stamp">unit</span>
            <p>The console slab, with a bevelled rim.</p>
          </div>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          Wells
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="slot grid gap-2 p-5">
            <span class="stamp">slot</span>
            <code>npx nuxt-backend doctor</code>
          </div>
          <div class="slot slot-pill flex items-center gap-3 px-5 py-3">
            <span class="stamp">slot slot-pill</span>
            <span class="text-(--ink-dim)">Search…</span>
          </div>
          <p>
            Inline <code class="slot slot-xs px-1.5 py-0.5">useBilling()</code> in a <code class="slot slot-xs px-1.5 py-0.5">slot slot-xs</code>.
          </p>
          <div class="carved grid gap-2 rounded-[10px] bg-(--warn-dim) p-5">
            <span class="stamp">carved</span>
            <span>A tinted well keeps its own ground.</span>
          </div>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          Chrome
        </h2>
        <div class="bar flex items-center justify-between rounded-[10px] px-5 py-3">
          <span class="stamp">bar</span>
          <span class="flex gap-2">
            <Key
              size="nav"
              to="/__parts"
            >Docs</Key>
            <Key size="nav">Playground</Key>
          </span>
        </div>
        <div class="min-w-0">
          <div class="code-plate px-4 py-2 text-sm">
            <span class="stamp">code-plate</span>
          </div>
          <pre class="slot m-0 overflow-x-auto rounded-t-none p-4 text-sm"><code>export default defineNuxtConfig({ modules: ['nuxt-backend'] })</code></pre>
        </div>
        <div class="seam px-5 py-4">
          <span class="stamp">seam</span>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          Relief
        </h2>
        <div class="plaque grid gap-5 p-6">
          <EngravedTitle
            text="The backend, machined"
            class="text-5xl font-extrabold uppercase [font-stretch:118%]"
          />
          <EngravedTitle
            size="sm"
            text="cut-sm: a page title"
            class="text-3xl font-bold"
          />
          <p class="emb text-3xl font-bold">
            emb: a section title
          </p>
          <p class="emb-sm text-xl font-semibold">
            emb-sm: a card title
          </p>
          <p class="engr font-mono text-xs uppercase tracking-[0.14em]">
            engr: an engraved label
          </p>
          <p class="engr-lt font-mono text-xs uppercase tracking-[0.14em]">
            engr-lt: a brighter one
          </p>
          <p class="stamp">
            stamp: the uppercase label
          </p>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          Keys
        </h2>
        <div class="plaque grid gap-5 p-6">
          <div class="flex flex-wrap items-center gap-3">
            <Key signal="go">
              Get started
            </Key>
            <Key>Read the docs</Key>
            <Key signal="warn">
              Pause
            </Key>
            <Key signal="err">
              Delete
            </Key>
            <Key disabled>
              Disabled
            </Key>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Key
              size="nav"
              to="/__parts"
            >
              Current page
            </Key>
            <Key size="nav">
              Nav key
            </Key>
            <Key
              size="xs"
              :pressed="pressed"
              @click="pressed = !pressed"
            >
              Pressed: {{ pressed ? 'on' : 'off' }}
            </Key>
            <Key
              size="xs"
              signal="go"
            >
              Copy
            </Key>
            <kbd class="k k-xs">⌘ K</kbd>
          </div>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          Lights
        </h2>
        <div class="plaque grid gap-5 p-6">
          <div class="flex flex-wrap items-center gap-6">
            <span class="flex items-center gap-2"><Led tone="ok" /> <span class="stamp">led-ok</span></span>
            <span class="flex items-center gap-2"><Led tone="warn" /> <span class="stamp">led-warn</span></span>
            <span class="flex items-center gap-2"><Led tone="err" /> <span class="stamp">led-err</span></span>
            <span class="flex items-center gap-2"><Led tone="off" /> <span class="stamp">led-off</span></span>
            <span class="flex items-center gap-2"><Led
              tone="ok"
              size="lg"
              pulse
              label="Live"
            /> <span class="stamp">led-lg led-pulse</span></span>
          </div>
          <div class="flex flex-wrap items-center gap-6">
            <Strip
              tone="ok"
              class="h-1.5 w-28"
            />
            <Strip
              tone="warn"
              class="h-1.5 w-28"
            />
            <Strip
              tone="err"
              class="h-1.5 w-28"
            />
            <Strip
              tone="ok"
              vertical
              class="h-12 w-1.5"
            />
          </div>
        </div>
      </section>

      <section class="grid gap-4">
        <h2 class="stamp">
          The LCD and the console
        </h2>
        <Console>
          <template #display>
            <Lcd label="doctor output">
              <div class="lcd-row">
                <span class="pxled led-ok" /><span class="px text-xl">auth ......... ok</span>
              </div>
              <div class="lcd-row">
                <span class="pxled led-warn" /><span class="px led-warn text-xl">billing ...... webhook secret unset</span>
              </div>
              <div class="lcd-row">
                <span class="pxled led-err" /><span class="px led-err text-xl">email ........ domain unverified</span>
              </div>
            </Lcd>
          </template>
          <template #keys>
            <Key signal="go">
              Init
            </Key>
            <Key>Doctor</Key>
          </template>
        </Console>
      </section>
    </div>
  </main>
</template>
