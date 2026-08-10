<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({ middleware: 'auth' })

// The page is the packaged <ProfileSettings>; the playground's Resend
// test-inbox policy plugs in through the validateEmail prop.
const { user, role } = useAuth()
const workspace = useOrganization()

const readout = computed(() => ({
  id: user.value?.id,
  email: user.value?.email,
  emailVerified: user.value?.emailVerified,
  role: role.value,
  workspace: workspace.current.value?.name,
}))

function validateEmail(value: string): boolean | string {
  return isDeliveredTestEmail(value) || TEST_EMAIL_HELP
}
</script>

<template>
  <div class="stack bk-depth">
    <PageHeader
      tag="ProfileSettings · useAuth"
      title="Profile"
    >
      The packaged <code>&lt;ProfileSettings&gt;</code> — identity, display
      name, and the two-step confirmed change-email flow. The playground's
      test-inbox allowlist plugs in via the <code>validate-email</code> prop.
      Untouched version under
      <NuxtLink to="/playground/vanilla/profile">Vanilla</NuxtLink>.
    </PageHeader>

    <LabPanel
      label="identity · email"
      title="Your account"
      tone="accent"
    >
      <ProfileSettings
        :validate-email="validateEmail"
        callback-path="/playground/saas/profile"
      />
    </LabPanel>

    <LabPanel
      label="session claims"
      title="Readout"
      variant="well"
    >
      <ClientOnly>
        <StateReadout :value="readout" />
      </ClientOnly>
    </LabPanel>
  </div>
</template>
