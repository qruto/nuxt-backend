<!-- Docs → playground bridge, embeddable from markdown:
     ::playground-link{to="/playground/platform/email" label="Email delivery"}
     Styled with Nuxt UI so it matches the docs theme. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  to: string
  label?: string
}>(), { label: 'this feature' })

const target = computed(() => props.to)
</script>

<template>
  <UCard
    variant="subtle"
    class="my-4"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <UIcon
          name="i-lucide-flask-conical"
          class="size-4 text-primary"
        />
        <span class="font-medium">Try {{ label }} live in the playground</span>
      </div>
      <UButton
        :to="target"
        color="primary"
        variant="soft"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
      >
        Open playground
      </UButton>
    </div>
    <p class="mt-2 text-xs text-muted">
      The playground runs against a live deployment — sign in with Resend's
      test inbox (<code>delivered@resend.dev</code>, <code>+label</code>
      aliases welcome).
    </p>
  </UCard>
</template>
