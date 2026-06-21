<!-- Illustrative live demo embedded in the docs: a reactive Convex query driven by
     mutations, with auth handled by <Authenticated> / <Unauthenticated>. -->
<script setup lang="ts">
import { api } from '#backend/api'

// Client-only query: a live `useQuery` subscribes during SSR/prerender and opens
// a Convex WebSocket that prevents `nuxt build` from exiting. The counter is only
// shown in the client-rendered <Authenticated> branch, so defer it to the client.
const counter = import.meta.client ? useQuery(api.counter.get, {}) : ref(undefined)
const increment = useMutation(api.counter.increment)
const reset = useMutation(api.counter.reset)

const value = computed(() => counter.value?.value ?? 0)
const busy = ref(false)

async function bump(by: number) {
  busy.value = true
  try {
    await increment({ by })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard
    variant="subtle"
    class="my-4"
  >
    <Authenticated>
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-baseline gap-3">
          <span class="text-3xl font-bold tabular-nums">{{ value }}</span>
          <code class="text-xs text-muted">useQuery(api.counter.get)</code>
        </div>
        <div class="flex gap-2">
          <UButton
            :loading="busy"
            icon="i-lucide-plus"
            color="primary"
            @click="bump(1)"
          >
            Increment
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-rotate-ccw"
            aria-label="Reset"
            @click="reset({})"
          />
        </div>
      </div>
      <p class="mt-2 text-sm text-muted">
        Live: the number is a Convex query; the buttons call mutations. Open this
        page in another tab to watch it sync in real time.
      </p>
    </Authenticated>

    <Unauthenticated>
      <p class="text-sm text-muted">
        This live demo writes to your Convex deployment.
        <ULink
          to="/login"
          class="text-primary"
        >Sign in</ULink>
        to run it, or explore the
        <ULink
          to="/playground"
          class="text-primary"
        >playground</ULink>.
      </p>
    </Unauthenticated>

    <AuthLoading>
      <p class="text-sm text-muted">
        Resolving session…
      </p>
    </AuthLoading>
  </UCard>
</template>
