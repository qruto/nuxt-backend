<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// The page is the packaged <WorkspaceSettings>; the site adds one showcase
// extra below it — spending a credit through the metered `ai.transform` action.
const credits = useCredits('credits')
const transform = useAction(api.ai.transform)

const spending = ref(false)
const spendError = ref<string | null>(null)

async function spendCredit() {
  spendError.value = null
  spending.value = true
  try {
    await transform({ text: 'Spend one credit from settings' })
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
          :disabled="(credits.balance.value ?? 0) < 1"
          @click="spendCredit"
        >
          Spend 1 credit
        </LabButton>
        <span class="hint">
          Calls the metered <code>ai.transform</code> action — the balance
          above updates reactively through the entitlement cache (full demo on
          <NuxtLink to="/playground/platform/credits">Credits</NuxtLink>).
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
