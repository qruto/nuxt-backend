<script setup lang="ts">
import ReferralLanding from '../components/billing/ReferralLanding.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made page a referral link opens, registered by the module at
 * `/r/:code` (module option `pages.referral`): it says who invited the
 * visitor and what they get, sends them to sign up (and back here to claim),
 * and claims the referral for an account that is signed in. The code lives
 * in the address; nothing is stored on the device. An app page at the same
 * path replaces it; build one with `useReferrals()` and the `claimReferral`
 * function.
 */
defineOptions({ name: 'ReferralPage' })
const { t } = useLabels('referral')
</script>

<template>
  <PageFrame
    page="referral"
    family="referral"
    :title="t('landing.title')"
    noindex
  >
    <ReferralLanding />
  </PageFrame>
</template>
