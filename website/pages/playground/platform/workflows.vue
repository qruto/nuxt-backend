<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const startWorkflow = useMutation(api.workflows.startDemoWorkflow)
const workflowId = ref<string | null>(null)
const workflowPending = ref(false)
const status = useWorkflowStatus(api.workflows.getWorkflowStatus, workflowId)

async function runWorkflow() {
  workflowPending.value = true
  try {
    workflowId.value = await startWorkflow({ label: new Date().toLocaleTimeString() })
  }
  finally { workflowPending.value = false }
}

const type = computed(() => status.value?.type ?? (workflowId.value ? 'starting' : 'idle'))
const tone = computed(() => {
  switch (type.value) {
    case 'completed': return 'ok'
    case 'failed': return 'err'
    case 'inProgress': return 'accent'
    case 'starting': return 'info'
    default: return 'muted'
  }
})
// LabPanel has no 'info'/'muted' tones — map them to its palette.
const panelTone = computed(() => (tone.value === 'info' ? 'accent' : tone.value === 'muted' ? 'neutral' : tone.value))

// Derive step states for the durable run: email → pause → result.
const running = computed(() => type.value === 'inProgress' || type.value === 'starting')
const done = computed(() => type.value === 'completed')
const steps = computed(() => [
  { label: 'send welcome email', tone: workflowId.value ? (running.value || done.value ? 'ok' : 'muted') : 'muted' },
  { label: 'durable pause (4s)', tone: running.value ? 'accent' : done.value ? 'ok' : 'muted' },
  { label: 'produce result', tone: done.value ? 'ok' : 'muted' },
] as const)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useWorkflowStatus"
      title="Workflows"
    >
      Durable workflows survive restarts and run for as long as they need — here,
      an email step, a 4-second durable pause, then a result.
      <code>useWorkflowStatus</code> watches the run live.
    </PageHeader>

    <LabPanel
      label="durable · run"
      title="demoWorkflow"
      :tone="panelTone"
    >
      <div class="row">
        <LabButton
          variant="signal"
          :loading="workflowPending"
          @click="runWorkflow"
        >
          {{ workflowPending ? 'Starting…' : 'Start workflow' }}
        </LabButton>
        <StatusRing
          :tone="tone"
          :pulse="running"
        >
          {{ type }}
        </StatusRing>
      </div>

      <div class="steps">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="step"
        >
          <StatusRing
            :tone="s.tone"
            :pulse="s.tone === 'accent'"
          >
            {{ s.label }}
          </StatusRing>
          <span
            v-if="i < steps.length - 1"
            class="riser"
          />
        </div>
      </div>

      <p
        v-if="status?.type === 'completed' && status.result"
        class="result mono"
      >
        result: {{ status.result }}
      </p>
      <p
        v-if="workflowId"
        class="hint"
      >
        <code>workflowId</code>: {{ workflowId }}
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.steps { display: flex; flex-direction: column; gap: 0; margin: 1.25rem 0 0.5rem; }
.step { display: flex; flex-direction: column; }
.riser { width: 2px; height: 16px; margin: 0.3rem 0 0.3rem 6px; background: var(--edge-hi); border-radius: 2px; }
.result { margin: 0.85rem 0 0.5rem; font-size: 0.82rem; color: var(--ok); word-break: break-word; }
</style>
