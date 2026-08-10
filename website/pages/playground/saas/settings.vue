<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// The page is the packaged <WorkspaceSettings>; the site adds one showcase
// extra below it — spending a credit through the demo `consumeCredit` action.
const credits = useCredits()
const consumeCredit = useAction(api.billing.consumeCredit)

const spending = ref(false)
const spendError = ref<string | null>(null)

async function spendCredit() {
  if (!credits.meterId.value) return
  spendError.value = null
  spending.value = true
  try {
    await consumeCredit({ meterId: credits.meterId.value })
  }
  catch (e) {
    spendError.value = e instanceof Error ? e.message : 'Failed'
  }
  finally {
    spending.value = false
  }
}
</script>

<template>
  <div class="stack bk-depth">
    <PageHeader
      tag="WorkspaceSettings · useOrganization · useBilling"
      title="Settings"
    >
      The packaged <code>&lt;WorkspaceSettings&gt;</code> — workspace, plan and
      credits in one place. The billing entity is the active workspace, so
      switching workspaces switches the subscription. Untouched version under
      <NuxtLink to="/playground/vanilla/settings">Vanilla</NuxtLink>.
    </PageHeader>

    <LabPanel
      label="workspace · billing · credits"
      title="Workspace settings"
      tone="accent"
    >
      <WorkspaceSettings pricing-path="/playground/saas/pricing" />
    </LabPanel>

    <LabPanel
      label="demo · metered usage"
      title="Spend credits"
      variant="well"
    >
      <div class="row">
        <LabButton
          variant="signal"
          :loading="spending"
          :disabled="!credits.meterId.value || (credits.balance.value ?? 0) < 1"
          @click="spendCredit"
        >
          Spend 1 credit
        </LabButton>
        <span class="hint">
          Calls the demo <code>billing.consumeCredit</code> action — the
          balance above updates reactively through the entitlement cache.
        </span>
      </div>
      <p
        v-if="spendError"
        class="msg err"
      >
        {{ spendError }}
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.msg { margin: 0.85rem 0 0; font-size: 0.8rem; }
.msg.err { color: var(--err); }
</style>
