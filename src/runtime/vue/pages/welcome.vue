<script setup lang="ts">
import { navigateTo } from '#imports'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'
import { useReturnPath } from '../composables/use-return-path'

/**
 * The ready-made first-run page, registered by the module at `/welcome`
 * (module option `pages.welcome`) behind the page guard: `<OnboardingFlow>`,
 * which a new account visits once after its first sign-in. Finishing or
 * skipping goes to {@link useReturnPath}: the page the person was headed for
 * (`?redirect=`, which the redirect that led them here carries), else to
 * where sign-in goes (`redirects.afterSignIn`). The heading
 * and document title are the `onboarding.title` label. Put a page of your own
 * at the same path to add steps of your own.
 */
defineOptions({ name: 'BackendWelcomePage' })
const { t } = useLabels('onboarding')
const back = useReturnPath()
const done = () => navigateTo(back.value)
</script>

<template>
  <PageFrame
    page="welcome"
    family="onboarding"
    :title="t('title')"
  >
    <OnboardingFlow @done="done" />
  </PageFrame>
</template>
