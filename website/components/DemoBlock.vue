<script setup lang="ts">
import { DEMO_STATUS, demoDeployment, type DeferredBackendState } from '../utils/live-demo'

/**
 * The frame every live demo on the docs is built in (a `::demo-*` block),
 * from the parts: a `plaque` with a `stamp` header that names the demo and
 * says where it stands (an LED beside the word), what it shows (`#about`),
 * the live part, and a footer with the deployment it runs against and its
 * page in the playground.
 *
 * The default slot is the live part. It renders inside <DeferredBackend>,
 * so only once the backend client has loaded: when the block scrolls into
 * view (`load="visible"`, the default), or when the reader presses the
 * `start` key (`load="click"`: for a demo that shows nothing until the
 * reader acts, such as signing in, nothing loads until they ask; one that
 * shows something live by itself, a counter or a connection, loads when
 * seen). Until then the frame says what will
 * happen, and when the client cannot load, why. Keep what calls the backend
 * in a lazy component of its own (`<LazyDemoXLive />`), so its code loads
 * with the client and not with the page. The page sets `demo: true`.
 */
const props = withDefaults(defineProps<{
  /** What the demo does, in a few words. */
  title: string
  /** The call it shows, lettered as code in the header: `useLoginFlow()`. */
  api?: string
  /** Its page in the playground, where the whole feature runs. */
  playground?: string
  load?: 'visible' | 'click'
  /** The start key's label, with `load="click"`. */
  start?: string
}>(), { api: undefined, playground: undefined, load: 'visible', start: 'Start the demo' })

const slots = defineSlots<{ default: () => unknown, about?: () => unknown }>()

const state = ref<DeferredBackendState>('idle')
const status = computed(() => DEMO_STATUS[state.value])
const deployment = demoDeployment(useRuntimeConfig().public.convex?.url)
const titleId = useId()

/** What the fallback says while the live part is not there; `unavailable` says it in the template, with its command. */
function note(current: DeferredBackendState): string {
  if (current === 'failed') return 'The demo could not connect. Check your connection, then try again.'
  if (current === 'stale') return 'The site has changed since this page loaded, so the demo cannot fetch its code. Reload the page to run it.'
  if (props.load === 'visible') return current === 'loading' ? 'Connecting to the backend…' : 'It connects when it scrolls into view.'
  return current === 'loading'
    ? 'Loading the backend client…'
    : 'Nothing loads until you start it: then the page fetches the backend client and connects.'
}

/** The fallback's one key, through start, load, retry and reload; none while a seen demo connects by itself. */
function keyLabel(current: DeferredBackendState, started: boolean): string | undefined {
  if (current === 'unavailable') return undefined
  if (current === 'failed') return 'Try again'
  if (current === 'stale') return 'Reload the page'
  if (props.load === 'click') return props.start
  return current === 'loading' && started ? 'Connecting' : undefined
}
</script>

<template>
  <section
    class="plaque my-6"
    :aria-labelledby="titleId"
  >
    <header class="mx-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-(--edge) px-[0.95rem] py-2.5">
      <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          class="stamp inline-flex items-center gap-1.5"
          :data-state="state"
        >
          <Led
            :tone="status.tone"
            :pulse="state === 'ready'"
          />
          Live demo · {{ status.word }}
        </span>
        <span
          :id="titleId"
          class="min-w-0 text-[0.9rem] font-semibold text-(--ink)"
        >{{ props.title }}</span>
      </div>
      <code
        v-if="props.api"
        class="slot slot-xs px-2 py-0.5 font-mono text-xs text-(--ink-dim)"
      >{{ props.api }}</code>
    </header>
    <div class="grid gap-4 p-4">
      <p
        v-if="slots.about"
        class="m-0 text-sm leading-relaxed text-(--ink-dim)"
      >
        <slot name="about" />
      </p>
      <DeferredBackend
        :load="props.load"
        @state="value => state = value"
      >
        <slot />
        <template #fallback="{ state: current, started, start: run }">
          <div class="slot flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p
              class="m-0 min-w-0 flex-1 basis-56 text-sm leading-relaxed text-(--ink-dim)"
              aria-live="polite"
            >
              <span v-if="current === 'unavailable'">
                This build has no backend to run against. Run the site with
                <code class="font-mono">pnpm dev</code> and the demos connect to your own deployment.
              </span>
              <span v-else>{{ note(current) }}</span>
            </p>
            <!-- One key through start, load, retry and reload, so focus stays on it. -->
            <Key
              v-if="keyLabel(current, started)"
              :signal="props.load === 'click' ? 'go' : undefined"
              :size="props.load === 'click' ? 'md' : 'xs'"
              :loading="current === 'loading'"
              @click="run"
            >
              {{ keyLabel(current, started) }}
            </Key>
          </div>
        </template>
      </DeferredBackend>
    </div>
    <footer
      v-if="deployment || props.playground"
      class="mx-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-(--edge) px-[0.95rem] py-2.5"
    >
      <span
        v-if="deployment"
        class="min-w-0 text-xs text-(--ink-faint) [overflow-wrap:anywhere]"
      >
        Runs against <code class="font-mono">{{ deployment.host }}</code>{{ deployment.local ? ', on this machine' : '' }}
      </span>
      <Key
        v-if="props.playground"
        :to="props.playground"
        size="xs"
        prefetch-on="interaction"
      >
        Open in the playground
      </Key>
    </footer>
  </section>
</template>
