<script setup lang="ts">
/**
 * The live half of ::demo-credits: the signed-in visitor's balance on the
 * `credits` meter and the plan behind it. It renders only inside
 * <DemoBlock>, once the backend client has loaded. Signed out, it says why
 * it needs an account and leads to the sign-in page, which brings the
 * visitor back here.
 */
const credits = useCredits({ meter: 'credits' })
const billing = useBilling()
const route = useRoute()

const plan = computed(() => {
  if (billing.isLoading.value) return '…'
  return billing.plan.value ?? 'no plan'
})
</script>

<template>
  <div>
    <Authenticated>
      <Lcd
        label="Your workspace"
        live
        class="min-w-48"
      >
        <div class="lcd-row">
          <span class="pxled led-ok" /><span class="px text-3xl tabular-nums">{{ credits.balance.value ?? '—' }}</span>
          <span class="text-(--ink-dim)">credits</span>
        </div>
        <div class="lcd-row text-(--ink-dim)">
          on {{ plan }}{{ billing.isFree.value ? ', the free plan' : '' }}
        </div>
      </Lcd>
    </Authenticated>

    <Unauthenticated>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 min-w-0 flex-1 basis-56 text-sm leading-relaxed text-(--ink-dim)">
          Credits belong to a workspace, so this needs an account: sign in
          with a sandbox identity, and its new workspace starts on the free
          plan's credits.
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
