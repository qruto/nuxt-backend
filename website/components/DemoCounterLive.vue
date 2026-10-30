<script setup lang="ts">
import { api } from '#backend/api'

/**
 * The live half of ::demo-counter: a query on the LCD and the mutations
 * that move it, for the signed-in visitor's own counter. It renders only
 * inside <DemoBlock>, once the backend client has loaded. Signed out, it
 * says why it needs an account and leads to the sign-in page, which brings
 * the visitor back here.
 */
const counter = useQuery(api.counter.get, {})
const increment = useMutation(api.counter.increment)
const reset = useMutation(api.counter.reset)
const route = useRoute()

const value = computed(() => counter.value?.value ?? 0)
const pending = ref<'increment' | 'reset' | null>(null)
const failure = ref<string | null>(null)

async function run(action: 'increment' | 'reset') {
  pending.value = action
  failure.value = null
  try {
    await (action === 'increment' ? increment({ by: 1 }) : reset({}))
  }
  catch (cause) {
    failure.value = getBackendError(cause)?.message ?? 'The counter did not change. Try again.'
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <div>
    <Authenticated>
      <div class="flex flex-wrap items-center gap-4">
        <Lcd
          label="Your counter"
          live
          class="min-w-36"
        >
          <div class="lcd-row">
            <span class="pxled led-ok" /><span class="px text-3xl tabular-nums">{{ value }}</span>
          </div>
        </Lcd>
        <div class="flex flex-wrap gap-2">
          <Key
            signal="go"
            :loading="pending === 'increment'"
            @click="run('increment')"
          >
            Increment
          </Key>
          <Key
            :loading="pending === 'reset'"
            @click="run('reset')"
          >
            Reset
          </Key>
        </div>
      </div>
      <p
        v-if="failure"
        role="alert"
        class="m-0 mt-3 text-sm text-(--err)"
      >
        {{ failure }}
      </p>
    </Authenticated>

    <Unauthenticated>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 min-w-0 flex-1 basis-56 text-sm leading-relaxed text-(--ink-dim)">
          The counter is yours, so it needs an account: sign in with a
          sandbox identity and come back here.
        </p>
        <Key
          :to="{ path: '/login', query: { redirect: route.fullPath } }"
          size="xs"
          prefetch-on="interaction"
        >
          Sign in
        </Key>
      </div>
    </Unauthenticated>

    <AuthLoading>
      <p class="m-0 text-sm text-(--ink-dim)">
        Reading your session…
      </p>
    </AuthLoading>
  </div>
</template>
