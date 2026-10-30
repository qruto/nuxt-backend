<script setup lang="ts">
import { Comment, computed, inject, useSlots, type VNode } from 'vue'
import { useHead } from '#imports'
import type { BackendPageKey } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import { useFrameNotices } from '../../utils/frame-notices'
import { NOINDEX_META } from '../../utils/page-rules'
import { IN_APP_SHELL } from './app-shell'
import FrameMain from './FrameMain.vue'

/**
 * The one frame every ready-made page renders through: the document title
 * and language, the `<main>` landmark with the page's `h1`, and around it
 * the banner, nav and status regions. A feature that belongs on every page
 * fills its region here once, and every page has it. The banner region
 * holds `<BackendNotices>` while an administrator's visit or maintenance
 * applies. The banner and nav regions sit before `<main>`, since neither is
 * the page's content, and render only when filled. The status region closes
 * `<main>`: `<ConnectionStatus>`, an empty live region while the connection
 * is up. Inside `<AppShell>` the shell owns the header, the notices, the
 * `<main>` landmark, the consent dialog and the connection status, so the
 * frame renders the page alone, in a `<div>` with its `h1`: nothing shows
 * twice. `test/nuxt/page-frame.test.ts` fails when a page skips the frame.
 *
 * @internal
 */
defineOptions({ name: 'BackendPageFrame' })

const props = withDefaults(defineProps<{
  /** The page's key, as `data-backend-page`. */
  page: BackendPageKey
  /** The `data-*` family the page's markup uses: `<main data-<family>="page">`. */
  family: string
  /** The document title, and the `h1` unless `heading` is `false`. */
  title: string
  /** Render `title` as the page's `h1`. `false` when the page's component renders its own. */
  heading?: boolean
  /** Keep the page out of search indexes with a `robots` meta tag: a public page that reads a token from its link. A page the guard protects has it already. */
  noindex?: boolean
}>(), { heading: true, noindex: false })
defineSlots<{
  /** The notices that hold for the whole session: `<BackendNotices>` while an administrator's visit or maintenance applies, unless a page fills it. */
  banner: () => unknown
  /** The navigation between the private pages: the account nav (app shell). */
  nav: () => unknown
  /** The page itself. */
  default: () => unknown
  /** The connection state: `<ConnectionStatus>` unless a page fills it. */
  status: () => unknown
}>()
const slots = useSlots()
const inShell = inject(IN_APP_SHELL, false)

// The document's language is the language the page's words are in: the
// active locale's with @nuxtjs/i18n, English (the labels' own) without.
const { locale } = useLabels('errors')
const notices = useFrameNotices()
useHead({
  title: computed(() => props.title),
  htmlAttrs: { lang: computed(() => locale.value ?? 'en') },
  meta: computed(() => (props.noindex ? [NOINDEX_META] : [])),
})

/** Whether a slot rendered something a person sees: a `v-if` that is off renders only a comment. */
const filled = (name: 'banner' | 'nav' | 'status'): boolean => Boolean((slots[name]?.() as VNode[] | undefined)?.some(node => node.type !== Comment))
/** Whether a region comes before <main>: the notices, or a nav a page filled. */
const before = () => !inShell && (filled('banner') || notices.value || filled('nav'))

// In the template: With nothing before it, the frame is the <main> alone: one
// root element, which a page transition needs.
</script>

<template>
  <FrameMain
    v-if="!before()"
    :page="page"
    :family="family"
    :title="title"
    :heading="heading"
    :shell="inShell"
  >
    <slot />
    <template
      v-if="slots.status"
      #status
    >
      <slot name="status" />
    </template>
  </FrameMain>
  <template v-else>
    <div
      v-if="filled('banner') || notices"
      data-backend-region="banner"
    >
      <slot name="banner">
        <BackendNotices />
      </slot>
    </div>
    <div
      v-if="filled('nav')"
      data-backend-region="nav"
    >
      <slot name="nav" />
    </div>
    <FrameMain
      :page="page"
      :family="family"
      :title="title"
      :heading="heading"
      :shell="inShell"
    >
      <slot />
      <template
        v-if="slots.status"
        #status
      >
        <slot name="status" />
      </template>
    </FrameMain>
  </template>
</template>
