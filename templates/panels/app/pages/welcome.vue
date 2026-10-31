<script setup lang="ts">
// The first run, in place of the packaged page at the same path
// (nuxt.config.ts sets that path from backend/routes.ts): the profile, one
// question of Panels' own, then the plan. A step of your own is
// a slot named like it in `steps`; <HowDidYouHear> keeps the answer for the
// growth funnel's first-touch source.
definePageMeta({ auth: true })

// Back to the page the person was headed for, else where sign-in lands.
const back = useReturnPath()
const done = () => navigateTo(back.value)
</script>

<template>
  <div class="page">
    <h1>Welcome to Panels</h1>
    <OnboardingFlow
      :steps="['profile', 'source', 'plan']"
      @done="done"
    >
      <template #source="{ next }">
        <HowDidYouHear @done="next()" />
      </template>
    </OnboardingFlow>
  </div>
</template>
